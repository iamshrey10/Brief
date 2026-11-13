import { ContactEmail } from "@/components/contact-email";
import { LegalPage, Section } from "@/components/legal-page";

export const metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy" updated="November 12, 2026">
      <p>
        Brief reads a contract you upload and explains it. This page says what it keeps, who else handles it, and how to
        remove it. It describes how the service works today, in plain words.
      </p>

      <Section title="What Brief keeps">
        <ul className="list-disc pl-5">
          <li>Your Google account&apos;s email address, to know whose documents are whose.</li>
          <li>Your first and last name, which you give on the welcome page. People you share your dashboard with see it instead of your email address.</li>
          <li>Why you said you came (a lease, a loan, a job offer or just looking). It is optional, and it is only ever counted.</li>
          <li>The file you upload, in private storage, and its name and the kind you chose. A photo is kept as the photo.</li>
          <li>The text of the document split into clauses, and a numeric fingerprint of each clause used for search.</li>
          <li>What Brief worked out from it: the key terms, the dates, and the answers to the questions to ask before signing.</li>
          <li>How many questions, reads and overviews you used today, to apply a daily limit.</li>
          <li>How long Brief is open and in use for you each day, and how many visits that was. It is seconds and a count, with no page names and no content.</li>
          <li>For up to 30 days, a record of how each question was answered: when, how long it took, and the ids of the clauses used. It holds no question and no answer text.</li>
          <li>If you share your dashboard: who it is shared with, the name you gave the invitation, and when access ends. The link and the code are kept only as scrambled values that cannot be turned back into the originals.</li>
          <li>If you turn on two-step verification: your authenticator secret, kept encrypted, your recovery codes, kept only as scrambled values, and the browsers you chose to trust.</li>
        </ul>
        <p>The questions you type and the answers you get are shown to you and are not saved by Brief.</p>
      </Section>

      <Section title="Who else handles your document">
        <p>
          Brief is built from services run by other companies, and your data passes through them. Its server and database are in the
          United States and your files are stored in North America. The website itself may be served to you from several places.
        </p>
        <ul className="list-disc pl-5">
          <li>
            <strong>Google</strong> provides sign in, and its Gemini service. To read your document and answer your questions, Brief
            sends the text of its clauses, and your question, to Gemini. Google&apos;s own terms for its paid Gemini service govern
            what it does with that.
          </li>
          <li><strong>Cloudflare</strong> stores the files you upload, in a private bucket. A file can only be opened through a link that is made for you and works for five minutes.</li>
          <li><strong>Neon</strong> holds the database: your account, the clauses, what was worked out, and the counts above.</li>
          <li><strong>Render</strong> runs Brief&apos;s server, which reads documents and answers questions.</li>
          <li><strong>Vercel</strong> serves the website you see and passes your requests on to the server.</li>
          <li><strong>Upstash</strong> keeps a short counter, with your email address on it, for about a minute, to stop one person sending too many requests at once.</li>
        </ul>
        <p>Nobody else is sent your document. Brief does not sell data and shows no advertising.</p>
      </Section>

      <Section title="When you share your dashboard">
        <p>
          Someone you invite sees your documents with their state, what was found in them, and the dates found, only after you approve
          them. They cannot open your files, ask questions, or change anything. You choose how long they can look, up to 90 days, and
          their access then stops by itself. You can give them more time or remove them at any time.
        </p>
      </Section>

      <Section title="What the owner of Brief can see">
        <p>
          The person who runs Brief has a page of totals: how many people signed up and were active, how long visits last on average,
          how many documents, questions, reads and overviews there are, and how many people came for each reason. These are counts.
          That page does not show anyone&apos;s name or email address, or any document, question or answer.
        </p>
      </Section>

      <Section title="What the logs hold">
        <p>
          The server&apos;s logs hold the time, how long something took, whether it worked, and ids. They are written
          so that they cannot hold the text of a document, a question, an answer or a file name, and a test checks that. The
          companies above also keep their own ordinary records of requests, such as the time and an internet address.
        </p>
      </Section>

      <Section title="Cookies and storage in your browser">
        <p>
          A few small cookies keep you signed in and protect the sign in. If you turn on two-step verification and choose to trust a
          browser, one more cookie remembers it for 30 days. Your choice of light or dark appearance is remembered in your browser.
          There are no advertising or tracking cookies.
        </p>
      </Section>

      <Section title="Removing your data">
        <p>
          Deleting a document moves it to the Bin, where it stays for 7 days so you can restore it, and is then removed with its file and
          everything Brief worked out from it. You can also delete it for good from the Bin at once. Deleting your account, from the
          bottom of your dashboard, removes every document and file you uploaded, your counts, your shares and your account, and it
          cannot be undone. The services above may keep a short recovery history of their databases for a while after that.
        </p>
        <p>An upload that was started and never finished is removed after an hour.</p>
      </Section>

      <Section title="Not legal advice">
        <p>
          Brief explains what a document says. It is not a lawyer and does not give legal advice. Please do not upload
          a document you do not have the right to share, and test with made up contracts if you are unsure.
        </p>
      </Section>

      <Section title="Questions">
        <p>
          To ask what Brief holds about you, or to have something removed that you cannot remove yourself, write to <ContactEmail className="text-primary underline" />.
        </p>
      </Section>
    </LegalPage>
  );
}
