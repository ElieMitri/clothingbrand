export function Terms() {
  return (
    <div className="min-h-screen pt-24 pb-16 px-4">
      <div className="max-w-4xl mx-auto surface-card rounded-3xl border border-slate-700/70 p-8 md:p-10">
        <p className="text-xs tracking-[0.18em] text-cyan-200">LEGAL</p>
        <h1 className="mt-3 font-display text-3xl md:text-5xl tracking-[0.08em] text-slate-50">
          TERMS OF SERVICE
        </h1>

        <div className="mt-8 space-y-6 text-slate-200 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-slate-100">1. Use of Service</h2>
            <p className="mt-2">
              By using LBathletes, you agree to use the platform lawfully and avoid
              misuse, fraud, or any activity that harms the service or other users.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100">2. Orders and Payments</h2>
            <p className="mt-2">
              All orders are subject to availability, verification, and acceptance.
              Prices and promotions can change without prior notice.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100">3. Returns and Cancellations</h2>
            <p className="mt-2">
              Orders can be cancelled before shipment. Once an order is shipped or delivered,
              it is considered final and non-refundable.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100">4. Account Responsibility</h2>
            <p className="mt-2">
              You are responsible for your account security and all activity under
              your credentials. Keep your login information private.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-100">5. Updates</h2>
            <p className="mt-2">
              We may update these terms when needed. Continued use of the service
              indicates acceptance of the latest version.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
