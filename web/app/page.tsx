import { auth } from "@/auth";
import { HERO_WORDS, LandingBackdrop } from "@/components/landing-backdrop";
import { LandingHero } from "@/components/landing-hero";
import { LandingFeatures } from "@/components/landing-features";
import { LandingSteps } from "@/components/landing-steps";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export default async function Home() {
  const session = await auth();
  const signedIn = Boolean(session?.user);

  return (
    <div className="flex flex-1 flex-col bg-background">
      <SiteHeader signedIn={signedIn} />
      <div className="relative isolate flex min-h-[calc(100svh-4.0625rem)] items-center overflow-hidden pb-[10vh]">
        <LandingBackdrop words={HERO_WORDS} />
        <LandingHero signedIn={signedIn} />
      </div>
      <LandingFeatures />
      <LandingSteps />
      <SiteFooter />
    </div>
  );
}
