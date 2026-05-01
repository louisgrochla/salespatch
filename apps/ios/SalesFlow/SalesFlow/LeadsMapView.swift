import SwiftUI
import Combine
import MapKit
import SwiftData

// MARK: — LeadsMapView
// Map of every geocoded lead. Filter chips at the top, pin tap surfaces a
// brand-styled lead card at the bottom; long-press toolbar enters multi-stop
// route planning. Single + multi + route-all paths all calculate via MKDirections.
//
// Brand-port pass: pins use `Brand.statusColor`, polylines use `Brand.signal`,
// every overlay card uses `.brandCard()`, all chips/buttons consume the
// shared brand styles. Layout untouched; behaviour untouched.
struct LeadsMapView: View {
    @Query private var leads: [Lead]
    @Environment(\.modelContext) private var modelContext
    @StateObject private var locationManager = MapLocationManager()
    @State private var selectedLead: Lead?
    @State private var showDetail = false
    @State private var cameraPosition: MapCameraPosition = .automatic
    @State private var geocodingService: GeocodingService?
    @State private var isGeocoding = false

    // Route state
    @State private var activeRoute: MKRoute?
    @State private var routeLead: Lead?

    // Multi-stop route planning
    @State private var isRoutePlanning = false
    @State private var routeStops: [Lead] = []
    @State private var multiStopRoutes: [MKRoute] = []
    @State private var isCalculatingRoute = false

    // Route-all default card
    @State private var allRoutes: [MKRoute] = []
    @State private var isCalculatingAllRoute = false
    @State private var showRouteAllCard = true

    // Filter
    @State private var selectedFilter = "all"
    private let filters = ["all", "new", "visited", "pitched", "sold", "rejected"]

    private var filteredLeads: [Lead] {
        let geocoded = leads.filter { $0.cachedLat != nil && $0.cachedLng != nil }
        if selectedFilter == "all" { return geocoded }
        return geocoded.filter { $0.status.lowercased() == selectedFilter }
    }

    var body: some View {
        NavigationStack {
            ZStack(alignment: .top) {
                // Map
                Map(position: $cameraPosition) {
                    UserAnnotation()

                    ForEach(filteredLeads) { lead in
                        if let coord = coordinate(for: lead) {
                            Annotation(lead.businessName, coordinate: coord) {
                                LeadMapPin(
                                    lead: lead,
                                    isSelected: selectedLead?.assignmentId == lead.assignmentId,
                                    stopNumber: stopNumber(for: lead)
                                )
                                .onTapGesture { pinTapped(lead) }
                            }
                        }
                    }

                    // Route overlays — gold to match the brand accent
                    if let route = activeRoute {
                        MapPolyline(route.polyline)
                            .stroke(Brand.signal, lineWidth: 5)
                    }
                    ForEach(Array(multiStopRoutes.enumerated()), id: \.offset) { _, route in
                        MapPolyline(route.polyline)
                            .stroke(Brand.signal, lineWidth: 5)
                    }
                }
                .mapStyle(.standard(elevation: .realistic, emphasis: .muted, pointsOfInterest: .excludingAll))
                .preferredColorScheme(.dark)
                .ignoresSafeArea(edges: .top)

                // Filter bar overlay
                VStack(spacing: 0) {
                    filterBar
                    Spacer()
                }
                .ignoresSafeArea(edges: .horizontal)

                // Bottom overlays
                VStack(spacing: 0) {
                    Spacer()

                    // Route info bar (single destination)
                    if let route = activeRoute, let lead = routeLead {
                        routeInfoBar(route: route, lead: lead)
                            .padding(.horizontal, 16)
                            .padding(.bottom, 8)
                            .transition(.move(edge: .bottom).combined(with: .opacity))
                    }

                    // Multi-stop panel (manual planning mode)
                    if isRoutePlanning && !routeStops.isEmpty {
                        multiStopPanel
                            .padding(.horizontal, 16)
                            .padding(.bottom, 8)
                            .transition(.move(edge: .bottom).combined(with: .opacity))
                    }

                    // Selected lead card
                    if let lead = selectedLead, showDetail, !isRoutePlanning {
                        LeadMapCard(
                            lead: lead,
                            onDismiss: dismissCard,
                            onDirections: { calculateRoute(to: lead) }
                        )
                        .padding(.horizontal, 16)
                        .padding(.bottom, 16)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                    }

                    // Default route-all card (when nothing else is showing)
                    if showRouteAllCard && selectedLead == nil && !isRoutePlanning && activeRoute == nil {
                        routeAllCard
                            .padding(.horizontal, 16)
                            .padding(.bottom, 16)
                            .transition(.move(edge: .bottom).combined(with: .opacity))
                    }

                    // Floating "Plan Route" button when card is dismissed
                    if !showRouteAllCard && selectedLead == nil && !isRoutePlanning && activeRoute == nil {
                        Button {
                            BrandHaptics.tap()
                            allRoutes = []
                            multiStopRoutes = []
                            showRouteAllCard = true
                        } label: {
                            HStack(spacing: 6) {
                                Image(systemName: "point.topleft.down.to.point.bottomright.curvepath.fill")
                                    .font(.system(size: 13))
                                Text("Plan route")
                            }
                        }
                        .buttonStyle(PrimaryButtonStyle(size: .sm))
                        .shadow(color: .black.opacity(0.35), radius: 6, y: 3)
                        .padding(.bottom, 16)
                        .transition(.scale.combined(with: .opacity))
                    }
                }
            }
            .navigationTitle("Map")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(Brand.ink, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button {
                        BrandHaptics.tap()
                        if isRoutePlanning {
                            toggleRoutePlanning()
                        } else if !showRouteAllCard {
                            // Reopen the route-all card
                            allRoutes = []
                            multiStopRoutes = []
                            showRouteAllCard = true
                        } else {
                            toggleRoutePlanning()
                        }
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: isRoutePlanning ? "xmark" : "point.topleft.down.to.point.bottomright.curvepath.fill")
                                .font(.system(size: 13))
                            if isRoutePlanning {
                                Text("Cancel")
                                    .font(Brand.Font.body(13, weight: .medium))
                            }
                        }
                        .foregroundStyle(isRoutePlanning ? Brand.err : Brand.signal)
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        BrandHaptics.tap()
                        centreOnUser()
                    } label: {
                        Image(systemName: "location.fill")
                            .foregroundStyle(Brand.signal)
                    }
                }
            }
            .task {
                locationManager.startUpdating()
                geocodingService = GeocodingService(context: modelContext)
                await geocodingService?.geocodeLeads(leads)
            }
            .animation(.spring(response: 0.3), value: showDetail)
            .animation(.spring(response: 0.3), value: isRoutePlanning)
            .animation(.spring(response: 0.3), value: routeStops.count)
            .animation(.spring(response: 0.3), value: activeRoute != nil)
        }
    }

    // MARK: — Filter Bar

    private var filterBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(filters, id: \.self) { filter in
                    let count = filter == "all"
                        ? filteredLeads.count
                        : leads.filter { $0.status.lowercased() == filter && $0.cachedLat != nil }.count
                    BrandChip(
                        label: filter == "all" ? "All" : Brand.statusLabel(for: filter),
                        count: count,
                        active: selectedFilter == filter
                    ) {
                        BrandHaptics.tap()
                        withAnimation(.easeInOut(duration: 0.18)) { selectedFilter = filter }
                    }
                }
            }
            .padding(.horizontal, 16)
        }
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity)
        .background(.ultraThinMaterial)
        .ignoresSafeArea(edges: .horizontal)
    }

    // MARK: — Route All Card (default state)

    private var routeAllCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Header
            HStack(spacing: 10) {
                Image(systemName: "map.fill")
                    .font(.system(size: 13))
                    .foregroundStyle(Brand.signal)
                VStack(alignment: .leading, spacing: 2) {
                    Text("/ PLAN YOUR ROUTE")
                        .font(Brand.Font.mono(9.5))
                        .tracking(Brand.Tracking.eyebrow)
                        .foregroundStyle(Brand.signal)
                    Text("\(filteredLeads.count) leads on map")
                        .font(Brand.Font.body(Brand.Font.bodySmall, weight: .medium))
                        .foregroundStyle(Brand.cream)
                }
                Spacer()

                if isCalculatingAllRoute {
                    ProgressView()
                        .scaleEffect(0.7)
                        .tint(Brand.signal)
                }

                Button {
                    BrandHaptics.tap()
                    showRouteAllCard = false
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(Brand.creamMuted)
                        .padding(6)
                        .background(Circle().fill(Brand.bgCard))
                        .overlay(Circle().strokeBorder(Brand.line, lineWidth: 1))
                }
                .buttonStyle(.plain)
            }

            // Lead list preview
            let visibleLeads = Array(filteredLeads.prefix(6))
            VStack(spacing: 6) {
                ForEach(Array(visibleLeads.enumerated()), id: \.element.assignmentId) { index, lead in
                    HStack(spacing: 10) {
                        Text("\(index + 1)")
                            .font(Brand.Font.mono(10, weight: .semibold))
                            .foregroundStyle(.white)
                            .frame(width: 20, height: 20)
                            .background(Circle().fill(Brand.statusColor(for: lead.status)))

                        Image(systemName: lead.businessIcon)
                            .font(.system(size: 11))
                            .foregroundStyle(Brand.creamMuted)
                            .frame(width: 16)

                        Text(lead.businessName)
                            .font(Brand.Font.body(13, weight: .medium))
                            .foregroundStyle(Brand.cream)
                            .lineLimit(1)

                        Spacer()

                        Text(lead.postcode)
                            .font(Brand.Font.mono(10.5))
                            .foregroundStyle(Brand.creamMuted)
                    }
                }
            }

            if filteredLeads.count > 6 {
                Text("+ \(filteredLeads.count - 6) more")
                    .font(Brand.Font.mono(10))
                    .tracking(Brand.Tracking.eyebrow)
                    .foregroundStyle(Brand.creamMuted)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.leading, 30)
            }

            // Route summary (after calculation)
            if !allRoutes.isEmpty {
                let totalTime = allRoutes.reduce(0) { $0 + $1.expectedTravelTime }
                let totalDist = allRoutes.reduce(0) { $0 + $1.distance }

                Rectangle().fill(Brand.line2).frame(height: 1)

                HStack(spacing: 8) {
                    Image(systemName: "car.fill")
                        .font(.system(size: 11))
                        .foregroundStyle(Brand.signal)
                    Text(formatTime(totalTime))
                        .font(Brand.Font.mono(13, weight: .semibold))
                        .foregroundStyle(Brand.cream)
                    Text("·").foregroundStyle(Brand.creamMuted)
                    Text(formatDistance(totalDist))
                        .font(Brand.Font.mono(13, weight: .semibold))
                        .foregroundStyle(Brand.cream)
                    Text("· \(filteredLeads.count) STOPS")
                        .font(Brand.Font.mono(10))
                        .tracking(Brand.Tracking.eyebrow)
                        .foregroundStyle(Brand.creamMuted)
                    Spacer()
                }
            }

            Rectangle().fill(Brand.line2).frame(height: 1)

            // Action buttons
            if allRoutes.isEmpty {
                Button {
                    BrandHaptics.tap()
                    Task { await calculateRouteToAll() }
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "point.topleft.down.to.point.bottomright.curvepath.fill")
                            .font(.system(size: 12))
                        Text("Calculate fastest route")
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(PrimaryButtonStyle(size: .sm))
                .disabled(filteredLeads.isEmpty || isCalculatingAllRoute)
                .opacity(filteredLeads.isEmpty ? 0.4 : 1)
            } else {
                HStack(spacing: 8) {
                    Button {
                        BrandHaptics.tap()
                        openAllInAppleMaps()
                    } label: {
                        HStack(spacing: 5) {
                            Image(systemName: "map.fill").font(.system(size: 12))
                            Text("Apple Maps")
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(PrimaryButtonStyle(size: .sm))

                    Button {
                        BrandHaptics.tap()
                        openAllInGoogleMaps()
                    } label: {
                        HStack(spacing: 5) {
                            Image(systemName: "globe").font(.system(size: 12))
                            Text("Google Maps")
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(GhostButtonStyle(size: .sm))
                }

                Button {
                    BrandHaptics.tap()
                    allRoutes = []
                    multiStopRoutes = []
                } label: {
                    Text("/ CLEAR ROUTE")
                        .font(Brand.Font.mono(10))
                        .tracking(Brand.Tracking.eyebrow)
                        .foregroundStyle(Brand.creamMuted)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.plain)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .brandCard(padding: 14)
    }

    // MARK: — Route Info Bar

    private func routeInfoBar(route: MKRoute, lead: Lead) -> some View {
        HStack(spacing: 12) {
            Image(systemName: "car.fill")
                .font(.system(size: 14))
                .foregroundStyle(Brand.signal)

            VStack(alignment: .leading, spacing: 4) {
                Text(lead.businessName)
                    .font(Brand.Font.display(14, weight: .medium))
                    .foregroundStyle(Brand.cream)
                    .lineLimit(1)
                Text(formatRouteInfo(route))
                    .font(Brand.Font.mono(11))
                    .foregroundStyle(Brand.creamDim)
            }

            Spacer()

            Button {
                BrandHaptics.tap(.medium)
                openAppleMapsNavigation(to: lead)
            } label: {
                HStack(spacing: 4) {
                    Image(systemName: "arrow.triangle.turn.up.right.diamond.fill")
                        .font(.system(size: 11))
                    Text("Navigate")
                }
            }
            .buttonStyle(PrimaryButtonStyle(size: .sm))

            Button {
                BrandHaptics.tap()
                activeRoute = nil
                routeLead = nil
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(Brand.creamMuted)
                    .padding(6)
                    .background(Circle().fill(Brand.bgCard))
                    .overlay(Circle().strokeBorder(Brand.line, lineWidth: 1))
            }
            .buttonStyle(.plain)
        }
        .frame(maxWidth: .infinity)
        .brandCard(padding: 12)
    }

    // MARK: — Multi-stop Panel

    private var multiStopPanel: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Image(systemName: "point.topleft.down.to.point.bottomright.curvepath.fill")
                    .font(.system(size: 12))
                    .foregroundStyle(Brand.signal)
                Text("/ ROUTE PLAN")
                    .font(Brand.Font.mono(9.5))
                    .tracking(Brand.Tracking.eyebrow)
                    .foregroundStyle(Brand.signal)
                Text("\(routeStops.count) STOPS")
                    .font(Brand.Font.mono(9.5))
                    .tracking(Brand.Tracking.eyebrow)
                    .foregroundStyle(Brand.creamMuted)
                Spacer()

                if isCalculatingRoute {
                    ProgressView().scaleEffect(0.7).tint(Brand.signal)
                }
            }

            // Stop list
            VStack(spacing: 6) {
                ForEach(Array(routeStops.enumerated()), id: \.element.assignmentId) { index, stop in
                    HStack(spacing: 10) {
                        Text("\(index + 1)")
                            .font(Brand.Font.mono(11, weight: .semibold))
                            .foregroundStyle(.white)
                            .frame(width: 22, height: 22)
                            .background(Circle().fill(Brand.signal))

                        Text(stop.businessName)
                            .font(Brand.Font.body(13, weight: .medium))
                            .foregroundStyle(Brand.cream)
                            .lineLimit(1)

                        Spacer()

                        Button {
                            BrandHaptics.tap()
                            removeStop(at: index)
                        } label: {
                            Image(systemName: "minus.circle.fill")
                                .font(.system(size: 16))
                                .foregroundStyle(Brand.err.opacity(0.7))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }

            // Route summary
            if !multiStopRoutes.isEmpty {
                let totalTime = multiStopRoutes.reduce(0) { $0 + $1.expectedTravelTime }
                let totalDist = multiStopRoutes.reduce(0) { $0 + $1.distance }

                Rectangle().fill(Brand.line2).frame(height: 1)

                HStack(spacing: 6) {
                    Text(formatTime(totalTime))
                        .font(Brand.Font.mono(12, weight: .medium))
                        .foregroundStyle(Brand.cream)
                    Text("·").foregroundStyle(Brand.creamMuted)
                    Text(formatDistance(totalDist))
                        .font(Brand.Font.mono(12, weight: .medium))
                        .foregroundStyle(Brand.cream)
                    Spacer()
                }
            }

            // Action buttons
            HStack(spacing: 8) {
                Button {
                    BrandHaptics.tap()
                    Task { await calculateMultiStopRoute() }
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "arrow.triangle.turn.up.right.circle")
                            .font(.system(size: 12))
                        Text("Calculate")
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(GhostButtonStyle(size: .sm))
                .disabled(routeStops.count < 2)
                .opacity(routeStops.count < 2 ? 0.4 : 1)

                if !multiStopRoutes.isEmpty {
                    Button {
                        BrandHaptics.tap(.medium)
                        openMultiStopNavigation()
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "arrow.triangle.turn.up.right.diamond.fill")
                                .font(.system(size: 12))
                            Text("Navigate")
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(PrimaryButtonStyle(size: .sm))
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .brandCard(padding: 14)
    }

    // MARK: — Actions

    private func coordinate(for lead: Lead) -> CLLocationCoordinate2D? {
        guard let lat = lead.cachedLat, let lng = lead.cachedLng else { return nil }
        return CLLocationCoordinate2D(latitude: lat, longitude: lng)
    }

    private func pinTapped(_ lead: Lead) {
        BrandHaptics.tap()
        if isRoutePlanning {
            if let idx = routeStops.firstIndex(where: { $0.assignmentId == lead.assignmentId }) {
                removeStop(at: idx)
            } else {
                routeStops.append(lead)
            }
        } else {
            selectedLead = lead
            showDetail = true
        }
    }

    private func dismissCard() {
        showDetail = false
        selectedLead = nil
    }

    private func stopNumber(for lead: Lead) -> Int? {
        guard isRoutePlanning else { return nil }
        if let idx = routeStops.firstIndex(where: { $0.assignmentId == lead.assignmentId }) {
            return idx + 1
        }
        return nil
    }

    private func toggleRoutePlanning() {
        if isRoutePlanning {
            isRoutePlanning = false
            routeStops = []
            multiStopRoutes = []
        } else {
            dismissCard()
            activeRoute = nil
            routeLead = nil
            isRoutePlanning = true
        }
    }

    private func removeStop(at index: Int) {
        routeStops.remove(at: index)
        multiStopRoutes = []
    }

    private func centreOnUser() {
        if let loc = locationManager.location {
            cameraPosition = .region(MKCoordinateRegion(
                center: loc.coordinate,
                span: MKCoordinateSpan(latitudeDelta: 0.02, longitudeDelta: 0.02)
            ))
        }
    }

    // MARK: — Single Route

    private func calculateRoute(to lead: Lead) {
        guard let destCoord = coordinate(for: lead) else { return }
        dismissCard()

        Task {
            let request = MKDirections.Request()
            if let userLoc = locationManager.location?.coordinate {
                request.source = MKMapItem(placemark: MKPlacemark(coordinate: userLoc))
            } else {
                request.source = MKMapItem.forCurrentLocation()
            }
            request.destination = MKMapItem(placemark: MKPlacemark(coordinate: destCoord))
            request.transportType = .automobile

            let directions = MKDirections(request: request)
            if let response = try? await directions.calculate(),
               let route = response.routes.first {
                activeRoute = route
                routeLead = lead

                let rect = route.polyline.boundingMapRect
                cameraPosition = .rect(rect.insetBy(dx: -rect.size.width * 0.2, dy: -rect.size.height * 0.2))
            }
        }
    }

    private func openAppleMapsNavigation(to lead: Lead) {
        guard let coord = coordinate(for: lead) else { return }
        let placemark = MKPlacemark(coordinate: coord)
        let mapItem = MKMapItem(placemark: placemark)
        mapItem.name = lead.businessName
        mapItem.openInMaps(launchOptions: [
            MKLaunchOptionsDirectionsModeKey: MKLaunchOptionsDirectionsModeDriving
        ])
    }

    // MARK: — Multi-stop Route

    private func calculateMultiStopRoute() async {
        guard routeStops.count >= 2 else { return }
        isCalculatingRoute = true
        defer { isCalculatingRoute = false }

        var routes: [MKRoute] = []

        var waypoints: [CLLocationCoordinate2D] = []
        if let userLoc = locationManager.location?.coordinate {
            waypoints.append(userLoc)
        }
        for stop in routeStops {
            if let coord = coordinate(for: stop) {
                waypoints.append(coord)
            }
        }

        for i in 0..<(waypoints.count - 1) {
            let request = MKDirections.Request()
            request.source = MKMapItem(placemark: MKPlacemark(coordinate: waypoints[i]))
            request.destination = MKMapItem(placemark: MKPlacemark(coordinate: waypoints[i + 1]))
            request.transportType = .automobile

            let directions = MKDirections(request: request)
            if let response = try? await directions.calculate(),
               let route = response.routes.first {
                routes.append(route)
            }
        }

        multiStopRoutes = routes
        zoomToFit(waypoints)
    }

    private func openMultiStopNavigation() {
        guard let first = routeStops.first, coordinate(for: first) != nil else { return }

        if routeStops.count == 1 {
            openAppleMapsNavigation(to: first)
            return
        }

        let destinations = routeStops.compactMap { lead -> String? in
            guard let coord = coordinate(for: lead) else { return nil }
            return "\(coord.latitude),\(coord.longitude)"
        }
        guard !destinations.isEmpty else { return }

        let daddr = destinations.joined(separator: "+to:")
        if let url = URL(string: "maps://?daddr=\(daddr)&dirflg=d") {
            UIApplication.shared.open(url)
        }
    }

    // MARK: — Route All

    private func calculateRouteToAll() async {
        guard !filteredLeads.isEmpty else { return }
        isCalculatingAllRoute = true
        defer { isCalculatingAllRoute = false }

        let sorted = sortByNearest(filteredLeads)

        var waypoints: [CLLocationCoordinate2D] = []
        if let userLoc = locationManager.location?.coordinate {
            waypoints.append(userLoc)
        }
        for lead in sorted {
            if let coord = coordinate(for: lead) {
                waypoints.append(coord)
            }
        }
        guard waypoints.count >= 2 else { return }

        var routes: [MKRoute] = []
        for i in 0..<(waypoints.count - 1) {
            let request = MKDirections.Request()
            request.source = MKMapItem(placemark: MKPlacemark(coordinate: waypoints[i]))
            request.destination = MKMapItem(placemark: MKPlacemark(coordinate: waypoints[i + 1]))
            request.transportType = .automobile

            let directions = MKDirections(request: request)
            if let response = try? await directions.calculate(),
               let route = response.routes.first {
                routes.append(route)
            }
        }

        allRoutes = routes
        multiStopRoutes = routes
        zoomToFit(waypoints)
    }

    /// Pan + zoom the camera to fit a set of waypoints.
    private func zoomToFit(_ waypoints: [CLLocationCoordinate2D]) {
        guard !waypoints.isEmpty else { return }
        var minLat = waypoints[0].latitude, maxLat = waypoints[0].latitude
        var minLng = waypoints[0].longitude, maxLng = waypoints[0].longitude
        for wp in waypoints {
            minLat = min(minLat, wp.latitude); maxLat = max(maxLat, wp.latitude)
            minLng = min(minLng, wp.longitude); maxLng = max(maxLng, wp.longitude)
        }
        let center = CLLocationCoordinate2D(latitude: (minLat + maxLat) / 2, longitude: (minLng + maxLng) / 2)
        let span = MKCoordinateSpan(
            latitudeDelta: (maxLat - minLat) * 1.4 + 0.005,
            longitudeDelta: (maxLng - minLng) * 1.4 + 0.005
        )
        cameraPosition = .region(MKCoordinateRegion(center: center, span: span))
    }

    /// Nearest-neighbor sort: pick the closest unvisited lead from the current position
    private func sortByNearest(_ leads: [Lead]) -> [Lead] {
        guard !leads.isEmpty else { return [] }
        var remaining = leads
        var sorted: [Lead] = []
        var current = locationManager.location?.coordinate
            ?? CLLocationCoordinate2D(latitude: 51.5074, longitude: -0.1278) // London fallback

        while !remaining.isEmpty {
            let nearest = remaining.enumerated().min { a, b in
                guard let coordA = coordinate(for: a.element),
                      let coordB = coordinate(for: b.element) else { return false }
                let distA = distanceBetween(current, coordA)
                let distB = distanceBetween(current, coordB)
                return distA < distB
            }
            if let nearest, let coord = coordinate(for: nearest.element) {
                sorted.append(nearest.element)
                remaining.remove(at: nearest.offset)
                current = coord
            } else {
                break
            }
        }
        return sorted
    }

    private func distanceBetween(_ a: CLLocationCoordinate2D, _ b: CLLocationCoordinate2D) -> Double {
        let loc1 = CLLocation(latitude: a.latitude, longitude: a.longitude)
        let loc2 = CLLocation(latitude: b.latitude, longitude: b.longitude)
        return loc1.distance(from: loc2)
    }

    private func openAllInAppleMaps() {
        let sorted = sortByNearest(filteredLeads)
        let destinations = sorted.compactMap { lead -> String? in
            guard let coord = coordinate(for: lead) else { return nil }
            return "\(coord.latitude),\(coord.longitude)"
        }
        guard !destinations.isEmpty else { return }
        let daddr = destinations.joined(separator: "+to:")
        if let url = URL(string: "maps://?daddr=\(daddr)&dirflg=d") {
            UIApplication.shared.open(url)
        }
    }

    private func openAllInGoogleMaps() {
        let sorted = sortByNearest(filteredLeads)
        let coords = sorted.compactMap { lead -> CLLocationCoordinate2D? in
            coordinate(for: lead)
        }
        guard !coords.isEmpty else { return }

        let destination = "\(coords.last!.latitude),\(coords.last!.longitude)"
        var urlString = "comgooglemaps://?daddr=\(destination)&directionsmode=driving"

        if coords.count > 1 {
            let waypoints = coords.dropLast().map { "\($0.latitude),\($0.longitude)" }
            urlString += "&waypoints=\(waypoints.joined(separator: "|"))"
        }

        if let url = URL(string: urlString), UIApplication.shared.canOpenURL(url) {
            UIApplication.shared.open(url)
        } else {
            let webDest = "\(coords.last!.latitude),\(coords.last!.longitude)"
            var webUrl = "https://www.google.com/maps/dir/?api=1&destination=\(webDest)&travelmode=driving"
            if coords.count > 1 {
                let waypoints = coords.dropLast().map { "\($0.latitude),\($0.longitude)" }
                webUrl += "&waypoints=\(waypoints.joined(separator: "|"))"
            }
            if let url = URL(string: webUrl) {
                UIApplication.shared.open(url)
            }
        }
    }

    // MARK: — Formatting

    private func formatRouteInfo(_ route: MKRoute) -> String {
        "\(formatTime(route.expectedTravelTime)) · \(formatDistance(route.distance)) · DRIVE"
    }

    private func formatTime(_ seconds: TimeInterval) -> String {
        let minutes = Int(seconds) / 60
        if minutes < 60 { return "\(minutes) min" }
        let hours = minutes / 60
        let remainingMinutes = minutes % 60
        return "\(hours)h \(remainingMinutes)m"
    }

    private func formatDistance(_ meters: Double) -> String {
        let miles = meters / 1609.34
        if miles < 0.1 { return "\(Int(meters)) m" }
        return String(format: "%.1f mi", miles)
    }
}

// MARK: — Lead Map Pin

private struct LeadMapPin: View {
    let lead: Lead
    let isSelected: Bool
    let stopNumber: Int?

    var body: some View {
        VStack(spacing: 0) {
            ZStack {
                // Balloon body — uses Brand.statusColor so pins read the same
                // colour story as the StatusPill on the lead card.
                Circle()
                    .fill(Brand.statusColor(for: lead.status))
                    .frame(width: 36, height: 36)
                    .overlay(
                        Circle().strokeBorder(.white.opacity(0.85), lineWidth: 2)
                    )
                    .shadow(color: .black.opacity(0.35), radius: 4, y: 2)

                if let number = stopNumber {
                    Text("\(number)")
                        .font(Brand.Font.mono(13, weight: .semibold))
                        .foregroundStyle(.white)
                } else {
                    Image(systemName: lead.businessIcon)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(.white)
                }
            }
            // Triangle pointer
            PinPointer()
                .fill(Brand.statusColor(for: lead.status))
                .frame(width: 14, height: 8)
                .offset(y: -2)
        }
        .scaleEffect(isSelected ? 1.2 : 1.0)
        .animation(.spring(response: 0.25, dampingFraction: 0.6), value: isSelected)
    }
}

// MARK: — Pin pointer triangle shape

private struct PinPointer: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: rect.midX, y: rect.maxY))
        path.addLine(to: CGPoint(x: rect.minX + 2, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX - 2, y: rect.minY))
        path.closeSubpath()
        return path
    }
}

// MARK: — Bottom card when pin tapped

private struct LeadMapCard: View {
    let lead: Lead
    let onDismiss: () -> Void
    let onDirections: () -> Void

    @State private var dragOffset: CGFloat = 0

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Drag indicator
            HStack {
                Spacer()
                RoundedRectangle(cornerRadius: 2)
                    .fill(Brand.creamMuted)
                    .frame(width: 36, height: 4)
                Spacer()
            }
            .padding(.bottom, 2)

            // Header: icon + name + dismiss
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: lead.businessIcon)
                    .font(.system(size: 16, weight: .medium))
                    .foregroundStyle(Brand.signal)
                    .frame(width: 36, height: 36)
                    .background(
                        RoundedRectangle(cornerRadius: 9, style: .continuous)
                            .fill(Brand.signalSoft)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 9, style: .continuous)
                            .strokeBorder(Brand.signalBorder, lineWidth: 1)
                    )

                VStack(alignment: .leading, spacing: 4) {
                    Text(lead.businessType.uppercased())
                        .font(Brand.Font.mono(9))
                        .tracking(Brand.Tracking.eyebrow)
                        .foregroundStyle(Brand.creamMuted)
                        .lineLimit(1)

                    Text(lead.businessName)
                        .font(Brand.Font.display(15, weight: .medium))
                        .foregroundStyle(Brand.cream)
                        .lineLimit(1)
                        .minimumScaleFactor(0.85)

                    metadataLine
                }

                Spacer()

                Button(action: {
                    BrandHaptics.tap()
                    onDismiss()
                }) {
                    Image(systemName: "xmark")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(Brand.creamMuted)
                        .padding(6)
                        .background(Circle().fill(Brand.bgCard))
                        .overlay(Circle().strokeBorder(Brand.line, lineWidth: 1))
                }
                .buttonStyle(.plain)
            }

            // Status + contact
            HStack(spacing: 10) {
                StatusPill(status: lead.status)

                if let person = lead.contactPerson {
                    HStack(spacing: 4) {
                        Image(systemName: "person.fill")
                            .font(.system(size: 9))
                            .foregroundStyle(Brand.creamMuted)
                        Text(person)
                            .font(Brand.Font.body(11))
                            .foregroundStyle(Brand.creamDim)
                        if let role = lead.contactRole {
                            Text("·").foregroundStyle(Brand.creamMuted)
                            Text(role)
                                .font(Brand.Font.body(11))
                                .foregroundStyle(Brand.creamMuted)
                        }
                    }
                }

                Spacer()
            }

            Rectangle().fill(Brand.line2).frame(height: 1)

            // Action buttons
            HStack(spacing: 8) {
                Button(action: {
                    BrandHaptics.tap()
                    onDirections()
                }) {
                    HStack(spacing: 4) {
                        Image(systemName: "arrow.triangle.turn.up.right.circle")
                            .font(.system(size: 12))
                        Text("Directions")
                    }
                }
                .buttonStyle(GhostButtonStyle(size: .sm))

                if let phone = lead.phone, !phone.isEmpty {
                    Button {
                        BrandHaptics.tap()
                        let cleaned = phone.replacingOccurrences(of: " ", with: "")
                        if let url = URL(string: "tel:\(cleaned)") {
                            UIApplication.shared.open(url)
                        }
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "phone.fill")
                                .font(.system(size: 11))
                            Text("Call")
                        }
                    }
                    .buttonStyle(GhostButtonStyle(size: .sm))
                }

                Spacer()

                NavigationLink(destination: LeadDetailView(lead: lead)) {
                    HStack(spacing: 4) {
                        Text("View")
                        Image(systemName: "chevron.right")
                            .font(.system(size: 9, weight: .bold))
                    }
                }
                .buttonStyle(PrimaryButtonStyle(size: .sm))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .brandCard(padding: 14)
        .offset(y: dragOffset)
        .gesture(
            DragGesture()
                .onChanged { value in
                    if value.translation.height > 0 {
                        dragOffset = value.translation.height
                    }
                }
                .onEnded { value in
                    if value.translation.height > 60 { onDismiss() }
                    dragOffset = 0
                }
        )
    }

    /// Postcode + rating in mono. Hidden if both are blank.
    private var metadataLine: some View {
        HStack(spacing: 6) {
            let postcode = lead.postcode.trimmingCharacters(in: .whitespaces)
            if !postcode.isEmpty {
                Text(postcode)
                    .font(Brand.Font.mono(10.5))
                    .foregroundStyle(Brand.creamDim)
            }
            if let rating = lead.googleRating, rating > 0 {
                if !postcode.isEmpty {
                    Circle().fill(Brand.line).frame(width: 3, height: 3)
                }
                HStack(spacing: 2) {
                    Image(systemName: "star.fill").font(.system(size: 8))
                    Text(String(format: "%.1f", rating))
                        .font(Brand.Font.mono(10.5))
                    if let count = lead.googleReviewCount {
                        Text("(\(count))")
                            .font(Brand.Font.mono(10))
                            .foregroundStyle(Brand.creamMuted)
                    }
                }
                .foregroundStyle(Brand.creamDim)
            }
        }
        .lineLimit(1)
    }
}

// MARK: — Location manager for map

@MainActor
final class MapLocationManager: NSObject, ObservableObject, CLLocationManagerDelegate {
    private let manager = CLLocationManager()
    @Published var location: CLLocation?

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
    }

    func startUpdating() {
        manager.requestWhenInUseAuthorization()
        manager.startUpdatingLocation()
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let loc = locations.last else { return }
        Task { @MainActor in self.location = loc }
    }
}
