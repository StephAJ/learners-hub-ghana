import {
  ContentPermission,
  GeneralPermission,
  type IPermissionSystem,
  type IUser,
  TemporaryFilePermission,
  UserDataPermission,
} from "@lumieducation/h5p-server";

export class RuntimeUser implements IUser {
  readonly type = "local" as const;

  constructor(
    readonly id: string,
    readonly name: string,
    readonly email: string,
    readonly role: "administrator" | "learner",
  ) {}
}

export class RuntimePermissionSystem
  implements IPermissionSystem<IUser>
{
  async checkForContent(
    user: IUser,
    permission: ContentPermission,
  ) {
    const role = runtimeRole(user);
    if (role === "administrator") return true;
    if (role !== "learner") return false;
    return permission === ContentPermission.View;
  }

  async checkForGeneralAction(
    user: IUser,
    permission: GeneralPermission,
  ) {
    if (runtimeRole(user) !== "administrator") return false;
    return [
      GeneralPermission.CreateRestricted,
      GeneralPermission.InstallRecommended,
      GeneralPermission.UpdateAndInstallLibraries,
    ].includes(permission);
  }

  async checkForTemporaryFile(
    user: IUser,
    permission: TemporaryFilePermission,
  ) {
    void permission;
    return runtimeRole(user) === "administrator";
  }

  async checkForUserData(
    user: IUser,
    permission: UserDataPermission,
  ) {
    void user;
    void permission;
    return false;
  }
}

function runtimeRole(user: IUser) {
  return user instanceof RuntimeUser ? user.role : undefined;
}

export function createAdministratorUser(
  tenantId: string,
  activityId: string,
) {
  return new RuntimeUser(
    `import:${tenantId}:${activityId}`,
    "Learners Hub importer",
    "",
    "administrator",
  );
}

export function createLearnerUser(
  tenantId: string,
  learnerPersonId: string,
) {
  return new RuntimeUser(
    `${tenantId}:${learnerPersonId}`,
    "Learner",
    "",
    "learner",
  );
}

export const assetReader = new RuntimeUser(
  "asset-reader",
  "H5P asset reader",
  "",
  "learner",
);
