import { LegalPage, Section } from "@/components/legal-page";

export const metadata = { title: "Terms" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms" updated="October 24, 2026">
      <p>
        Brief is a personal project, not a company, offered as it is. By using it you agree to the points below. They are
        written in plain words on purpose.
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
          Only upload a document you have the right to share. You keep all rights to it. Brief uses it only to read it and
          answer your questions, as the privacy page describes.
        </p>
      </Section>

      <Section title="Limits">
        <p>
          To keep it fair and affordable, there are limits: up to 25 documents at a time, 50 MB and 100 pages for each, and a
          daily number of questions, reads and overviews. The limits can change.
        </p>
      </Section>

      <Section title="No promises">
        <p>
          Brief comes with no warranty. It may be slow, unavailable, changed or removed, and answers can contain mistakes.
          To the extent the law allows, its maker is not responsible for decisions you make using it.
        </p>
      </Section>

      <Section title="Your account">
        <p>You can delete your account and everything in it at any time from your dashboard.</p>
      </Section>
    </LegalPage>
  );
}
