import { PublicNav } from "@/components/layout/public-nav";
import { PublicFooter } from "@/components/layout/public-footer";

export default function AboutPage() {
  return (
    <div className="premium-page-bg min-h-screen text-foreground">
      <PublicNav />
      <main className="container py-12">
        <section className="glass-card-strong max-w-4xl p-5 sm:p-8">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">About Plaivra</p>
          <h1 className="mt-3 text-4xl font-bold tracking-normal text-foreground">The Paradigm Shift in Fitness</h1>
          <div className="mt-6 space-y-8 text-base leading-8 text-muted-foreground">
            <p>
              Artificial Intelligence has fundamentally democratized personal coaching. Today, anyone can open ChatGPT, speak
              naturally about their goals, injuries, and dietary preferences, and instantly receive a world-class,
              hyper-personalized fitness and nutrition strategy. AI has become the world's most accessible personal trainer.
            </p>

            <section>
              <h2 className="text-2xl font-semibold tracking-normal text-foreground">The Problem: Trapped in the Chat</h2>
              <p className="mt-3">
                Flawless, customized plans were getting permanently trapped inside endless chat histories, disorganized
                copy-pastes, and static PDFs. When it came time to actually sweat or cook, users were forced to scroll through
                text walls, manually log metrics, or battle traditional fitness apps that didn't understand fluid AI
                descriptions. The spark of inspiration was constantly killed by administrative friction. The missing link
                wasn't the planning - it was the execution.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold tracking-normal text-foreground">Our Solution: The Execution Layer</h2>
              <p className="mt-3">
                Plaivra was built to complete the AI fitness loop. We don't try to replace your conversational AI coach; we
                give it a powerhouse dashboard. Plaivra acts as a premium, data-dense translation bridge. With a single push,
                our platform takes unstructured text from your chat window and instantly maps it into a beautifully structured,
                interactive ecosystem:
              </p>
              <div className="mt-5 space-y-4">
                <p className="glass-chip p-4">
                  <span className="font-semibold text-primary">Interactive Workout Splits:</span> Text descriptions
                  instantly become chronological calendars, target sets, exact rep goals, and automated rest timers.
                </p>
                <p className="glass-chip p-4">
                  <span className="font-semibold text-primary">Fluid Meal Parsing:</span> Casual recipe descriptions are
                  translated into strict macronutrient targets, protein metrics, and clean grocery lists.
                </p>
                <p className="glass-chip p-4">
                  <span className="font-semibold text-primary">Smart Name Bridge:</span> Mismatched names or unique
                  vocabulary terms from the AI are automatically mapped directly to a standardized, clean database.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold tracking-normal text-foreground">Our Philosophy</h2>
              <p className="mt-3">
                We believe your energy should be spent hitting your personal records and hitting your macros, not managing
                data entry. ChatGPT does the thinking. Plaivra handles the doing. Welcome to the frictionless future of elite
                performance tracking.
              </p>
            </section>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
