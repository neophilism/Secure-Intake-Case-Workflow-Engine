export default async function SubmissionConfirmationPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;

  return (
    <main>
      <h1>Submission received</h1>
      <p>Your submission has been recorded.</p>
      <p>
        Confirmation code: <strong>{code}</strong>
      </p>
      <p>
        Keep this code for your records. It is a receipt identifier, not a
        password and not a way to retrieve private submission contents.
      </p>
    </main>
  );
}
