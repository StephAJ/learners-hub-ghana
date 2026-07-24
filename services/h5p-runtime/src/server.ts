import express, {
  type ErrorRequestHandler,
  type Request,
} from "express";
import helmet from "helmet";
import {
  h5pAjaxExpressRouter,
} from "@lumieducation/h5p-express";
import type { H5PEditor } from "@lumieducation/h5p-server";
import type { RuntimeConfig } from "./config.js";
import { createH5pRuntime, type H5pRuntime } from "./h5p-runtime.js";
import { assetReader, type RuntimeUser } from "./runtime-user.js";
import {
  RequestAuthenticationError,
  verifyImportRequest,
  verifyLaunchGrant,
} from "./security.js";

export async function createServer(config: RuntimeConfig) {
  const { editor, runtime } = await createH5pRuntime(config);
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: "cross-origin" },
      frameguard: false,
    }),
  );
  app.get("/health", (_request, response) => {
    response.json({ service: "learners-hub-h5p", status: "healthy" });
  });
  addPackageImportRoute(app, runtime, config);
  addPlayerRoute(app, runtime, config);
  addH5pAssetRoutes(app, editor, config);
  app.use(errorHandler);
  return app;
}

function addPackageImportRoute(
  app: express.Express,
  runtime: H5pRuntime,
  config: RuntimeConfig,
) {
  const packageBody = express.raw({
    limit: config.maxPackageBytes,
    type: ["application/octet-stream", "application/x-h5p"],
  });
  app.post("/v1/packages", packageBody, async (request, response, next) => {
    try {
      if (!Buffer.isBuffer(request.body)) {
        response.status(415).json({ error: "Send raw H5P package bytes." });
        return;
      }
      const authentication = verifyImportRequest({
        body: request.body,
        headers: request.headers,
        nowSeconds: Math.floor(Date.now() / 1000),
        sharedSecret: config.sharedSecret,
      });
      const imported = await runtime.importPackage({
        ...authentication,
        bytes: request.body,
      });
      response.status(imported.reused ? 200 : 201).json({
        contentId: imported.contentId,
      });
    } catch (error) {
      next(error);
    }
  });
}

function addPlayerRoute(
  app: express.Express,
  runtime: H5pRuntime,
  config: RuntimeConfig,
) {
  app.get("/v1/player/:contentId", async (request, response, next) => {
    try {
      const grant =
        typeof request.query.grant === "string" ? request.query.grant : "";
      const claims = verifyLaunchGrant({
        expectedContentId: request.params.contentId,
        grant,
        nowSeconds: Math.floor(Date.now() / 1000),
        sharedSecret: config.sharedSecret,
      });
      setPlayerSecurityHeaders(response, config.parentOrigin);
      response.status(200).send(
        await runtime.renderPlayer(request.params.contentId, claims),
      );
    } catch (error) {
      next(error);
    }
  });
}

function addH5pAssetRoutes(
  app: express.Express,
  editor: H5PEditor,
  config: RuntimeConfig,
) {
  app.use("/h5p", (request, _response, next) => {
    const h5pRequest = request as Request & {
      language: string;
      user: RuntimeUser;
    };
    h5pRequest.language = "en";
    h5pRequest.user = assetReader;
    next();
  });
  app.use(
    "/h5p",
    h5pAjaxExpressRouter(
      editor,
      config.coreDirectory,
      config.dataDirectory,
      {
        handleErrors: true,
        routeContentUserData: false,
        routeEditorCoreFiles: false,
        routeFinishedData: false,
        routeGetAjax: true,
        routeGetContentFile: true,
        routeGetDownload: false,
        routeGetLibraryFile: true,
        routeGetParameters: false,
        routeGetTemporaryContentFile: false,
        routePostAjax: false,
        routeCoreFiles: true,
      },
      "en",
    ),
  );
}

function setPlayerSecurityHeaders(
  response: express.Response,
  parentOrigin: string,
) {
  response.setHeader("cache-control", "private, no-store");
  response.setHeader("referrer-policy", "no-referrer");
  response.setHeader(
    "content-security-policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "media-src 'self' blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      `frame-ancestors ${parentOrigin}`,
      "base-uri 'none'",
      "form-action 'none'",
    ].join("; "),
  );
}

const errorHandler: ErrorRequestHandler = (error, request, response, next) => {
  void request;
  void next;
  if (error instanceof RequestAuthenticationError) {
    response.status(401).json({ error: error.message });
    return;
  }
  if (isBodyTooLarge(error)) {
    response.status(413).json({ error: "The H5P package exceeds 25 MB." });
    return;
  }
  const status = h5pStatus(error);
  const message =
    status < 500 && error instanceof Error
      ? error.message
      : "The H5P runtime could not complete this request.";
  response.status(status).json({ error: message });
};

function isBodyTooLarge(error: unknown) {
  return (
    error instanceof Error &&
    "type" in error &&
    (error as { type?: string }).type === "entity.too.large"
  );
}

function h5pStatus(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "httpStatusCode" in error &&
    Number.isInteger((error as { httpStatusCode?: number }).httpStatusCode)
  ) {
    return Number((error as { httpStatusCode: number }).httpStatusCode);
  }
  return 500;
}
