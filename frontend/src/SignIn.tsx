import { useQuery } from "@tanstack/react-query";
import { fetchMe } from "./api";
import { PanelError, Skeleton } from "./ui";
import "./signin.css";

/** Shown to someone signed in whose email is not linked to a player. */
export const NotOnList = () => (
  <p role="status">You're signed in, but you're not on the player list for this pool yet. Ask the pool admin to add you.</p>
);

/** Explains the emailed-code sign-in before sending the visitor to the identity provider's page. */
export function SignIn() {
  const { data: me, error } = useQuery({ queryKey: ["me"], queryFn: fetchMe });
  if (error) return <PanelError error={error} />;
  if (!me) return <Skeleton lines={4} />;
  return (
    <div className="narrow signin">
      <h2 className="label">Sign in</h2>
      {me.signed_in ? (
        me.known ? (
          <p>You're signed in. <a href="/picks">Go to the picks.</a></p>
        ) : (
          <NotOnList />
        )
      ) : (
        <div className="card">
          <h3>Sign in with a code</h3>
          <ol>
            <li>Continue, and enter your email address.</li>
            <li>Cloudflare emails you a 6-digit code.</li>
            <li>Enter the code on the next screen.</li>
          </ol>
          <p>Only players on the pool's list can sign in.</p>
          <a className="go" href="/login">Continue to sign in</a>
          <p className="hint">No email? Check your spam folder for a message from Cloudflare.</p>
        </div>
      )}
    </div>
  );
}
