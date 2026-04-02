export function About() {
  return (
    <div className="min-h-screen pt-24 pb-12 px-4 bg-white">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-4xl font-light text-center mb-12 tracking-wider">
          ABOUT US
        </h1>

        <div className="space-y-8 text-gray-600 leading-relaxed">
          <p className="text-lg">
            Welcome to Minimal, where timeless fashion meets modern simplicity.
          </p>

          <p>
            Founded with a vision to create clothing that transcends trends, we
            believe in the power of minimalist design and quality craftsmanship.
            Every piece in our collection is carefully curated to embody elegance,
            versatility, and sustainability.
          </p>

          <p>
            Our philosophy is simple: less is more. We design for the conscious
            consumer who values quality over quantity, and style that endures
            beyond seasons.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-12">
            <div>
              <h3 className="text-xl font-light mb-3 tracking-wide">
                QUALITY
              </h3>
              <p className="text-sm">
                We source the finest materials and work with skilled artisans to
                ensure every piece meets our exacting standards.
              </p>
            </div>

            <div>
              <h3 className="text-xl font-light mb-3 tracking-wide">
                SUSTAINABILITY
              </h3>
              <p className="text-sm">
                We're committed to ethical production practices and reducing our
                environmental footprint.
              </p>
            </div>

            <div>
              <h3 className="text-xl font-light mb-3 tracking-wide">
                TIMELESS
              </h3>
              <p className="text-sm">
                Our designs are created to last, both in quality and style,
                season after season.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
