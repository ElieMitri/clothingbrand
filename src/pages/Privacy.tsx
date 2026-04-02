export function Privacy() {
  return (
    <div className="min-h-screen pt-24 pb-16 px-4">
      <div className="max-w-4xl mx-auto surface-card rounded-3xl border border-slate-700/70 p-8 md:p-10">
        <p className="text-xs tracking-[0.18em] text-cyan-200">LEGAL</p>
        <h1 className="mt-3 font-display text-3xl md:text-5xl tracking-[0.08em] text-slate-50">
          PRIVACY POLICY
        </h1>

        <div className="mt-8 space-y-6 text-slate-200 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-slate-100">1. Information We Collect</h2>
            <p className="mt-2">
              We collect account details, order data, and interaction information
              needed to run the store and support your purchases.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100">2. How We Use Data</h2>
            <p className="mt-2">
              Data is used to process orders, provide support, improve experience,
              and send updates you choose to receive.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100">3. Data Security</h2>
            <p className="mt-2">
              We apply industry-standard technical and organizational safeguards to
              protect your data from unauthorized access.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100">4. Data Sharing</h2>
            <p className="mt-2">
              We do not sell personal data. Information may be shared only with
              essential service providers required to deliver the platform.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100">5. Your Choices</h2>
            <p className="mt-2">
              You can request account updates or deletion and manage optional
              communication preferences at any time.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
