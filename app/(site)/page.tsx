import { HomePageClient } from "@/components/home-page-client";
import { catalogoHref } from "@/lib/site-config";

export default function HomePage() {
  return <HomePageClient catalogoUrl={catalogoHref()} />;
}
