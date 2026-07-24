import "./globals.css";
import { ThemeProvider, themeInitScript } from "@/components/layout/ThemeProvider";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { FeedbackProvider } from "@/components/feedback/FeedbackProvider";
import { StudentStatusProvider } from "@/components/students/StudentStatusProvider";
import { PhaseProvider } from "@/components/layout/PhaseProvider";
import { AppShell } from "@/components/layout/AppShell";

const SITE_NAME = "Torii Minds";
const SITE_URL = "https://toriiminds.com";

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — Step IN, Stand OUT`,
    template: `%s · ${SITE_NAME}`,
  },
  description:
    "Torii Minds — a gateway to tech excellence through experiential, AI-ready learning, placement training, and coding mastery.",
  applicationName: SITE_NAME,
  keywords: [
    "Torii Minds",
    "AI Ready Engineer",
    "Placement Training",
    "Aptitude",
    "Coding",
    "2027 Batch",
  ],
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: `${SITE_NAME} — Step IN, Stand OUT`,
    description:
      "Experiential, AI-ready learning and placement training that takes engineers from trainee to skilled professional.",
    url: SITE_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — Step IN, Stand OUT`,
  },
};

export const viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0f1a" },
  ],
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Apply theme before paint to avoid a flash of incorrect theme. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-dvh antialiased">
        <ThemeProvider>
          <AuthProvider>
            <FeedbackProvider>
              <StudentStatusProvider>
                <PhaseProvider>
                  <AppShell>{children}</AppShell>
                </PhaseProvider>
              </StudentStatusProvider>
            </FeedbackProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
