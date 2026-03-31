import Header from "@/components/ui/Header";
import HeroSection from "@/components/sections/HeroSection";
import TrustBar from "@/components/sections/TrustBar";
import LoanSections from "@/components/sections/LoanSections";
import CtaBanner from "@/components/sections/CtaBanner";
import Footer from "@/components/ui/Footer";

export default function Home() {
  return (
    <>
      <Header />
      <main className="flex-1">
        <HeroSection />
        <TrustBar />
        <LoanSections />
        <CtaBanner />
      </main>
      <Footer />
    </>
  );
}
