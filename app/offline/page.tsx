import Link from "next/link";
import { BrandMark } from "../components/brand-mark";
import "../error-page.css";

export const dynamic = "force-static";

/**
 * What a person sees when the connection is gone and this page is new to them.
 *
 * Deliberately static and dependency-free: it is cached by the service worker
 * at install, so it has to render without a database, a session or a fetch.
 *
 * The copy names what still works. "You are offline" is a statement of the
 * obvious; what a teacher standing in a corridor with no signal needs is to
 * know that the register they already opened is still there and that nothing
 * they typed has been lost.
 */
export default function OfflinePage() {
  return (
    <main className="error-page">
      <BrandMark size={44} />
      <h1>You are offline</h1>
      <p>
        This page has not been opened on this device yet, so there is no copy
        of it to show. Pages you have already visited still open.
      </p>
      <p>
        Nothing you have already saved is lost. Anything you were part-way
        through typing has not been sent, so check it before you leave the
        screen once the connection is back.
      </p>
      <p className="error-actions">
        <Link href="/">Try the school home page</Link>
      </p>
    </main>
  );
}
