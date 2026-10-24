import { LegalPage, Section } from "@/components/legal-page";

export const metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy" updated="October 24, 2026">
      <p>
        Brief reads a contract you upload and explains it. This page says what it keeps, who else sees it, and how to
        remove it. It describes how the service works today, in plain words.
      </p>

      <Section title="What Brief keeps">
        <ul className="list-disc pl-5">
          <li>Your Google account&apos;s email address, to know whose documents are whose.</li>
          <li>The file you upload, in private storage, and its name and the kind you chose.</li>
          <li>The text of the document split into clauses, and a numeric fingerprint of each clause used for search.</li>
          <li>What Brief worked out from it: the key terms and the answers to the questions to ask before signing.</li>
          <li>How many questions, reads and overviews you used today, to apply a daily limit.</li>
          <li>For up to 30 days, a record of how each question was answered: when, how long it took, and the ids of the clauses used. It holds no question and no answer text.</li>
        </ul>
        <p>The questions you type and the answers you get are shown to you and are not saved by Brief.</p>
      </Section>

      <Section title="Who else sees your document">
        <p>
          To read your document and answer your questions, Brief sends the text of its clauses, and your question, to
          Google&apos;s Gemini service. Google&apos;s own terms govern what it does with that. Brief&apos;s file storage is
          provided by Cloudflare. Sign in is provided by Google. Nobody else is sent your document.
        </p>
      </Section>

      <Section title="What the logs hold">
        <p>
          The server&apos;s logs hold the time, how long something took, whether it worked, and ids. They are written
          so that they cannot hold the text of a document, a question, an answer or a file name, and a test checks that.
        </p>
      </Section>

      <Section title="Cookies and storage in your browser">
        <p>
          One cookie keeps you signed in. Your choice of light or dark appearance is remembered in your browser. There are
          no advertising or tracking cookies.
        </p>
      </Section>

      <Section title="Removing your data">
        <p>
          Deleting a document removes its file and everything Brief worked out from it. Deleting your account, from the
          bottom of your dashboard, removes every document and file you uploaded and your account, and it cannot be undone.
        </p>
      </Section>

      <Section title="Not legal advice">
        <p>
          Brief explains what a document says. It is not a lawyer and does not give legal advice. Please do not upload
          a document you do not have the right to share, and test with made up contracts if you are unsure.
        </p>
      </Section>

      <Section title="Questions">
        <p>
          Open an issue at <a className="text-primary underline" href="https://github.com/iamshrey10/Brief/issues">github.com/iamshrey10/Brief</a>.
        </p>
      </Section>
    </LegalPage>
  );
}
