import { auth } from "@/auth";
import { LandingHero } from "@/components/landing-hero";
import { LandingFeatures } from "@/components/landing-features";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export default async function Home() {
  const session = await auth();
  const signedIn = Boolean(session?.user);

  return (
    <div className="flex flex-1 flex-col bg-background">
      <SiteHeader signedIn={signedIn} />
      <div className="flex flex-1 items-center">
        <LandingHero signedIn={signedIn} />
      </div>
      <LandingFeatures />
      <SiteFooter />
    </div>
  );
}
