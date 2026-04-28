import SwiftUI

// MARK: — BrandBackground
// Three-layer warm-ink background used by every screen in the app.
//
//   1. Ink base           — `rgb(20, 20, 19)`.
//   2. 72pt line grid     — white @ 0.022, masked by a radial gradient so
//                           grid lines fade at the edges and feel editorial
//                           rather than ruled-notebook.
//   3. Top warm glow      — `signal @ 0.12` radial from centre-top, the
//                           subtle "stage lighting" that warms the page.
//
// Apply once at the TabView root; every screen inherits automatically.
//
//   ZStack {
//       BrandBackground()
//       TabView { … }
//   }
//   .ignoresSafeArea()

struct BrandBackground: View {
    var body: some View {
        ZStack {
            Brand.ink

            GridPattern()
                .mask(
                    RadialGradient(
                        colors: [.black, .black.opacity(0)],
                        center: UnitPoint(x: 0.5, y: 0.15),
                        startRadius: 0,
                        endRadius: 900
                    )
                )

            TopGlow()
                .frame(maxHeight: .infinity, alignment: .top)
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
    }
}

// MARK: — GridPattern
/// Hairline 72pt grid. Horizontal + vertical lines at `Brand.gridLine`.
private struct GridPattern: View {
    var body: some View {
        Canvas { context, size in
            let step = Brand.gridSize
            let stroke = Color(Brand.gridLine)
            var path = Path()

            var x: CGFloat = 0
            while x <= size.width {
                path.move(to: CGPoint(x: x, y: 0))
                path.addLine(to: CGPoint(x: x, y: size.height))
                x += step
            }

            var y: CGFloat = 0
            while y <= size.height {
                path.move(to: CGPoint(x: 0, y: y))
                path.addLine(to: CGPoint(x: size.width, y: y))
                y += step
            }

            context.stroke(path, with: .color(stroke), lineWidth: 1)
        }
    }
}

// MARK: — TopGlow
/// Warm signal-gold radial glow at the top of the viewport.
private struct TopGlow: View {
    var body: some View {
        RadialGradient(
            colors: [Brand.topGlow, Brand.topGlow.opacity(0)],
            center: UnitPoint(x: 0.5, y: 0),
            startRadius: 0,
            endRadius: 420
        )
        .frame(height: 420)
    }
}

#Preview {
    ZStack {
        BrandBackground()
        VStack(spacing: 12) {
            Text("/ BRAND BACKGROUND")
                .font(Brand.Font.mono())
                .tracking(Brand.Tracking.eyebrow)
                .foregroundStyle(Brand.signal)
            Text("Warm ink, grid, glow.")
                .font(Brand.Font.display(36))
                .tracking(Brand.Tracking.display)
                .foregroundStyle(Brand.cream)
        }
    }
    .preferredColorScheme(.dark)
}
