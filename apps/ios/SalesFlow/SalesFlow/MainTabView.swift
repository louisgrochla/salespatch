import SwiftUI

struct MainTabView: View {
    @EnvironmentObject private var authStore: AuthStore
    @EnvironmentObject private var appearanceStore: AppearanceStore
    @State private var selectedTab = 0

    var body: some View {
        ZStack {
            BrandBackground()

            TabView(selection: $selectedTab) {
                LeadsView()
                    .tabItem {
                        Label("Leads", systemImage: "list.bullet.rectangle")
                    }
                    .tag(0)

                LeadsMapView()
                    .tabItem {
                        Label("Map", systemImage: "map")
                    }
                    .tag(1)

                PayoutsView()
                    .tabItem {
                        Label("Payouts", systemImage: "sterlingsign.circle")
                    }
                    .tag(2)

                ProfileView()
                    .tabItem {
                        Label("Profile", systemImage: "person.circle")
                    }
                    .tag(3)
            }
            .tint(Brand.signal)
            .toolbarBackground(Brand.ink, for: .tabBar)
            .toolbarBackground(.visible, for: .tabBar)
        }
        .preferredColorScheme(.dark)
    }
}

#Preview {
    MainTabView()
        .environmentObject(AuthStore.shared)
}
