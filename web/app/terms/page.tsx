import { ContactEmail } from "@/components/contact-email";
import { LegalPage, Section } from "@/components/legal-page";

export const metadata = { title: "Terms" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms" updated="November 12, 2026">
      <p>
        Brief is a personal project, not a company, made and run by Shreyas Revankar, and offered as it is. By using it you agree
        to the points below. They are written in plain words on purpose.
      </p>

      <Section title="What Brief is, and is not">
        <p>
          Brief explains what a document says and shows the words behind each answer. It is not a lawyer, it does not give
          legal advice, and it never tells you whether to sign. It can be wrong or can miss something, so check anything
          that matters against the original, and ask a professional before you sign anything important.
        </p>
      </Section>

      <Section title="What you upload">
        <p>
          Only upload a document you have the right to share, and nothing unlawful. You keep all rights to it. Brief uses it only to
          read it and answer your questions, as the privacy page describes. A PDF, JPG, PNG or HEIC file works. A photo that is too
          blurry to read may be refused.
        </p>
      </Section>

      <Section title="Limits">
        <p>
          To keep it fair and affordable, there are limits: up to 25 documents at a time, 50 MB and 100 pages for each, and a
          daily number of questions, reads and overviews (today 40, 10 and 20). The whole site also has a daily cap on how much AI
          work it does, so on a busy day Brief may say it is busy until tomorrow. The limits can change.
        </p>
      </Section>

      <Section title="Using Brief fairly">
        <ul className="list-disc pl-5">
          <li>Do not try to get around the limits, including by making extra accounts.</li>
          <li>Do not try to overload the service, break into it, or reach anyone else&apos;s documents or account.</li>
          <li>Keep your account to yourself, and keep your sign in secure.</li>
        </ul>
      </Section>

      <Section title="Sharing your dashboard">
        <p>
          You decide who to share with and for how long, up to 90 days, and you can end it at any time. Share only with people you
          trust, because they can see your documents&apos; states, what was found in them and the dates found while access lasts. You are
          responsible for what you choose to share.
        </p>
      </Section>

      <Section title="No promises">
        <p>
          Brief comes with no warranty. It may be slow, unavailable, changed or removed, and answers can contain mistakes.
          To the extent the law allows, its maker is not responsible for decisions you make using it.
        </p>
      </Section>

      <Section title="Your account">
        <p>
          You can delete your account and everything in it at any time from your dashboard. An account that breaks these terms or puts
          others at risk may be suspended or removed, and Brief may be changed or stopped at any time.
        </p>
      </Section>

      <Section title="Changes to these terms">
        <p>
          These terms may change. The date at the top says when they last did. If you keep using Brief after a change, you accept it.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Questions about these terms: <ContactEmail className="text-primary underline" />.
        </p>
      </Section>
    </LegalPage>
  );
}
