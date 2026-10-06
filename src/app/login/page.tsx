import { loginAction } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main>
      <h1>Sign in</h1>
      <p>
        Sign in to an organization account. Authentication establishes identity;
        organization membership establishes tenant access.
      </p>

      {error === "invalid_credentials" ? (
        <p role="alert">The email address or password was not accepted.</p>
      ) : null}

      <form action={loginAction}>
        <label>
          Email
          <input
            name="email"
            type="email"
            autoComplete="username"
            required
          />
        </label>

        <label>
          Password
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </label>

        <button type="submit">Sign in</button>
      </form>
    </main>
  );
}
