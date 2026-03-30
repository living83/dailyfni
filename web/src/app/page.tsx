import Header from "@/components/ui/Header";
import HeroSection from "@/components/sections/HeroSection";
import Footer from "@/components/ui/Footer";

export default function Home() {
  return (
    <>
      <Header />
      <main className="flex-1">
        <HeroSection />
      </main>
      <Footer />
    </>
  );
}
