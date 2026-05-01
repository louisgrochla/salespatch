import SwiftUI
import Combine
import MapKit
import SwiftData

// MARK: — LeadsMapView
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

                    // Route overlays
                    if let route = activeRoute {
                        MapPolyline(route.polyline)
                            .stroke(Theme.accent, lineWidth: 5)
                    }
                    ForEach(Array(multiStopRoutes.enumerated()), id: \.offset) { _, route in
                        MapPolyline(route.polyline)
                            .stroke(Theme.accent, lineWidth: 5)
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
                            allRoutes = []
                            multiStopRoutes = []
                            showRouteAllCard = true
                        } label: {
                            HStack(spacing: 6) {
                                Image(systemName: "point.topleft.down.to.point.bottomright.curvepath.fill")
                                    .font(.system(size: 14))
                                Text("Plan Route")
                                    .font(.system(size: 14, weight: .semibold))
                            }
                            .foregroundStyle(.white)
                            .padding(.horizontal, 18)
                            .padding(.vertical, 10)
                            .background(Theme.accent)
                            .clipShape(Capsule())
                            .shadow(color: .black.opacity(0.3), radius: 6, y: 3)
                        }
                        .buttonStyle(.plain)
                        .padding(.bottom, 16)
                        .transition(.scale.combined(with: .opacity))
                    }
                }
            }
            .navigationTitle("Map")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button {
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
                                .font(.system(size: 14))
                            if isRoutePlanning {
                                Text("Cancel")
                                    .font(.system(size: 13, weight: .medium))
                            }
                        }
                        .foregroundStyle(isRoutePlanning ? Theme.statusRejected : Theme.accent)
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button(action: centreOnUser) {
                        Image(systemName: "location.fill")
                            .foregroundStyle(Theme.accent)
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
                    Button {
                        selectedFilter = filter
                    } label: {
                        Text(filter == "all" ? "All" : Theme.statusLabel(for: filter))
                            .font(.system(size: 12, weight: selectedFilter == filter ? .semibold : .medium))
                            .foregroundStyle(selectedFilter == filter ? .white : Theme.textSecondary)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 6)
                            .background(
                                selectedFilter == filter
                                    ? (filter == "all" ? Theme.accent : Theme.statusColor(for: filter))
                                    : Theme.surface.opacity(0.9)
                            )
                            .clipShape(Capsule())
                            .overlay(
                                Capsule()
                                    .stroke(
                                        selectedFilter == filter
                                            ? Color.clear
                                            : Theme.border,
                                        lineWidth: Theme.borderWidth
                                    )
                            )
                    }
                    .buttonStyle(.plain)
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
        VStack(spacing: 10) {
            // Header
            HStack {
                Image(systemName: "map.fill")
                    .font(.system(size: 14))
                    .foregroundStyle(Theme.accent)
                VStack(alignment: .leading, spacing: 1) {
                    Text("Plan Your Route")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Theme.textPrimary)
                    Text("\(filteredLeads.count) leads on map")
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.textSecondary)
                }
                Spacer()

                if isCalculatingAllRoute {
                    ProgressView()
                        .scaleEffect(0.7)
                }

                Button {
                    showRouteAllCard = false
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(Theme.textMuted)
                        .padding(6)
                        .background(Theme.surfaceElevated)
                        .clipShape(Circle())
                }
                .buttonStyle(.plain)
            }

            // Lead list preview
            let visibleLeads = Array(filteredLeads.prefix(6))
            ForEach(Array(visibleLeads.enumerated()), id: \.element.assignmentId) { index, lead in
                HStack(spacing: 10) {
                    Text("\(index + 1)")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(width: 20, height: 20)
                        .background(Theme.statusColor(for: lead.status))
                        .clipShape(Circle())

                    Image(systemName: lead.businessIcon)
                        .font(.system(size: 11))
                        .foregroundStyle(Theme.textMuted)
                        .frame(width: 16)

                    Text(lead.businessName)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(Theme.textPrimary)
                        .lineLimit(1)

                    Spacer()

                    Text(lead.postcode)
                        .font(.system(size: 11))
                        .foregroundStyle(Theme.textMuted)
                }
            }

            if filteredLeads.count > 6 {
                Text("+\(filteredLeads.count - 6) more")
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.textMuted)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.leading, 30)
            }

            // Route summary (after calculation)
            if !allRoutes.isEmpty {
                let totalTime = allRoutes.reduce(0) { $0 + $1.expectedTravelTime }
                let totalDist = allRoutes.reduce(0) { $0 + $1.distance }

                Divider().overlay(Theme.border)

                HStack(spacing: 6) {
                    Image(systemName: "car.fill")
                        .font(.system(size: 11))
                        .foregroundStyle(Theme.accent)
                    Text(formatTime(totalTime))
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Theme.textPrimary)
                    Text("·")
                        .foregroundStyle(Theme.textMuted)
                    Text(formatDistance(totalDist))
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Theme.textPrimary)
                    Text("· \(filteredLeads.count) stops")
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.textSecondary)
                    Spacer()
                }
            }

            Divider().overlay(Theme.border)

            // Action buttons
            if allRoutes.isEmpty {
                // Calculate route button
                Button {
                    Task { await calculateRouteToAll() }
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "point.topleft.down.to.point.bottomright.curvepath.fill")
                            .font(.system(size: 13))
                        Text("Calculate Fastest Route")
                            .font(.system(size: 13, weight: .semibold))
                    }
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                    .background(Theme.accent)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.radiusButton))
                }
                .buttonStyle(.plain)
                .disabled(filteredLeads.isEmpty || isCalculatingAllRoute)
                .opacity(filteredLeads.isEmpty ? 0.5 : 1)
            } else {
                // Open in maps buttons
                HStack(spacing: 8) {
                    Button {
                        openAllInAppleMaps()
                    } label: {
                        HStack(spacing: 5) {
                            Image(systemName: "map.fill")
                                .font(.system(size: 12))
                            Text("Apple Maps")
                                .font(.system(size: 13, weight: .semibold))
                        }
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .background(Theme.accent)
                        .clipShape(RoundedRectangle(cornerRadius: Theme.radiusButton))
                    }
                    .buttonStyle(.plain)

                    Button {
                        openAllInGoogleMaps()
                    } label: {
                        HStack(spacing: 5) {
                            Image(systemName: "globe")
                                .font(.system(size: 12))
                            Text("Google Maps")
                                .font(.system(size: 13, weight: .semibold))
                        }
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .background(Color(hex: "#34A853"))
                        .clipShape(RoundedRectangle(cornerRadius: Theme.radiusButton))
                    }
                    .buttonStyle(.plain)
                }

                // Recalculate / clear
                Button {
                    allRoutes = []
                    // Remove route overlays from map
                    multiStopRoutes = []
                } label: {
                    Text("Clear Route")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(Theme.textMuted)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(14)
        .background(Theme.surface)
        .clipShape(RoundedRectangle(cornerRadius: Theme.radiusCard))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.radiusCard)
                .stroke(Theme.border, lineWidth: Theme.borderWidth)
        )
    }

    // MARK: — Route Info Bar

    private func routeInfoBar(route: MKRoute, lead: Lead) -> some View {
        HStack(spacing: 12) {
            Image(systemName: "car.fill")
                .font(.system(size: 14))
                .foregroundStyle(Theme.accent)

            VStack(alignment: .leading, spacing: 2) {
                Text(lead.businessName)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Theme.textPrimary)
                Text(formatRouteInfo(route))
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.textSecondary)
            }

            Spacer()

            Button {
                openAppleMapsNavigation(to: lead)
            } label: {
                Text("Navigate")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(Theme.statusSold)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.radiusButton))
            }
            .buttonStyle(.plain)

            Button {
                activeRoute = nil
                routeLead = nil
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(Theme.textMuted)
                    .padding(6)
                    .background(Theme.surfaceElevated)
                    .clipShape(Circle())
            }
            .buttonStyle(.plain)
        }
        .padding(12)
        .background(Theme.surface)
        .clipShape(RoundedRectangle(cornerRadius: Theme.radiusCard))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.radiusCard)
                .stroke(Theme.border, lineWidth: Theme.borderWidth)
        )
    }

    // MARK: — Multi-stop Panel

    private var multiStopPanel: some View {
        VStack(spacing: 10) {
            // Header
            HStack {
                Image(systemName: "point.topleft.down.to.point.bottomright.curvepath.fill")
                    .font(.system(size: 14))
                    .foregroundStyle(Theme.accent)
                Text("Route Plan")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Theme.textPrimary)
                Text("(\(routeStops.count) stops)")
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.textSecondary)
                Spacer()

                if isCalculatingRoute {
                    ProgressView()
                        .scaleEffect(0.7)
                }
            }

            // Stop list
            ForEach(Array(routeStops.enumerated()), id: \.element.assignmentId) { index, stop in
                HStack(spacing: 10) {
                    // Stop number
                    Text("\(index + 1)")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(width: 22, height: 22)
                        .background(Theme.accent)
                        .clipShape(Circle())

                    Text(stop.businessName)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(Theme.textPrimary)
                        .lineLimit(1)

                    Spacer()

                    // Remove stop
                    Button {
                        removeStop(at: index)
                    } label: {
                        Image(systemName: "minus.circle.fill")
                            .font(.system(size: 16))
                            .foregroundStyle(Theme.statusRejected.opacity(0.7))
                    }
                    .buttonStyle(.plain)
                }
            }

            // Route summary
            if !multiStopRoutes.isEmpty {
                let totalTime = multiStopRoutes.reduce(0) { $0 + $1.expectedTravelTime }
                let totalDist = multiStopRoutes.reduce(0) { $0 + $1.distance }

                Divider().overlay(Theme.border)

                HStack {
                    Text(formatTime(totalTime))
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(Theme.textSecondary)
                    Text("·")
                        .foregroundStyle(Theme.textMuted)
                    Text(formatDistance(totalDist))
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(Theme.textSecondary)
                    Spacer()
                }
            }

            // Action buttons
            HStack(spacing: 10) {
                Button {
                    Task { await calculateMultiStopRoute() }
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "arrow.triangle.turn.up.right.circle")
                            .font(.system(size: 13))
                        Text("Calculate")
                            .font(.system(size: 13, weight: .medium))
                    }
                    .foregroundStyle(routeStops.count >= 2 ? Theme.accent : Theme.textMuted)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                    .background(Theme.accent.opacity(routeStops.count >= 2 ? 0.1 : 0.05))
                    .clipShape(RoundedRectangle(cornerRadius: Theme.radiusButton))
                    .overlay(
                        RoundedRectangle(cornerRadius: Theme.radiusButton)
                            .stroke(Theme.accent.opacity(0.3), lineWidth: Theme.borderWidth)
                    )
                }
                .buttonStyle(.plain)
                .disabled(routeStops.count < 2)

                if !multiStopRoutes.isEmpty {
                    Button {
                        openMultiStopNavigation()
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "arrow.triangle.turn.up.right.diamond.fill")
                                .font(.system(size: 13))
                            Text("Navigate")
                                .font(.system(size: 13, weight: .semibold))
                        }
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                        .background(Theme.statusSold)
                        .clipShape(RoundedRectangle(cornerRadius: Theme.radiusButton))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(14)
        .background(Theme.surface)
        .clipShape(RoundedRectangle(cornerRadius: Theme.radiusCard))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.radiusCard)
                .stroke(Theme.border, lineWidth: Theme.borderWidth)
        )
    }

    // MARK: — Actions

    private func coordinate(for lead: Lead) -> CLLocationCoordinate2D? {
        guard let lat = lead.cachedLat, let lng = lead.cachedLng else { return nil }
        return CLLocationCoordinate2D(latitude: lat, longitude: lng)
    }

    private func pinTapped(_ lead: Lead) {
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
            // Exit route planning
            isRoutePlanning = false
            routeStops = []
            multiStopRoutes = []
        } else {
            // Enter route planning
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

                // Zoom to show the route
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

        // Build waypoints: user location → stop1 → stop2 → ...
        var waypoints: [CLLocationCoordinate2D] = []
        if let userLoc = locationManager.location?.coordinate {
            waypoints.append(userLoc)
        }
        for stop in routeStops {
            if let coord = coordinate(for: stop) {
                waypoints.append(coord)
            }
        }

        // Calculate route between each pair
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

        // Zoom to show all stops
        if !waypoints.isEmpty {
            var minLat = waypoints[0].latitude
            var maxLat = waypoints[0].latitude
            var minLng = waypoints[0].longitude
            var maxLng = waypoints[0].longitude
            for wp in waypoints {
                minLat = min(minLat, wp.latitude)
                maxLat = max(maxLat, wp.latitude)
                minLng = min(minLng, wp.longitude)
                maxLng = max(maxLng, wp.longitude)
            }
            let center = CLLocationCoordinate2D(
                latitude: (minLat + maxLat) / 2,
                longitude: (minLng + maxLng) / 2
            )
            let span = MKCoordinateSpan(
                latitudeDelta: (maxLat - minLat) * 1.4 + 0.005,
                longitudeDelta: (maxLng - minLng) * 1.4 + 0.005
            )
            cameraPosition = .region(MKCoordinateRegion(center: center, span: span))
        }
    }

    private func openMultiStopNavigation() {
        // Open Apple Maps with first stop as destination
        // Apple Maps URL scheme supports sequential navigation
        guard let first = routeStops.first, coordinate(for: first) != nil else { return }

        if routeStops.count == 1 {
            openAppleMapsNavigation(to: first)
            return
        }

        // Build waypoints for Apple Maps
        let destinations = routeStops.compactMap { lead -> String? in
            guard let coord = coordinate(for: lead) else { return nil }
            return "\(coord.latitude),\(coord.longitude)"
        }
        guard !destinations.isEmpty else { return }

        // Apple Maps supports daddr with +to: for multiple stops
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

        // Sort leads by nearest-neighbor from user location for fastest route
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
        multiStopRoutes = routes // show on map

        // Zoom to fit all
        if !waypoints.isEmpty {
            var minLat = waypoints[0].latitude, maxLat = waypoints[0].latitude
            var minLng = waypoints[0].longitude, maxLng = waypoints[0].longitude
            for wp in waypoints {
                minLat = min(minLat, wp.latitude)
                maxLat = max(maxLat, wp.latitude)
                minLng = min(minLng, wp.longitude)
                maxLng = max(maxLng, wp.longitude)
            }
            let center = CLLocationCoordinate2D(
                latitude: (minLat + maxLat) / 2,
                longitude: (minLng + maxLng) / 2
            )
            let span = MKCoordinateSpan(
                latitudeDelta: (maxLat - minLat) * 1.4 + 0.005,
                longitudeDelta: (maxLng - minLng) * 1.4 + 0.005
            )
            cameraPosition = .region(MKCoordinateRegion(center: center, span: span))
        }
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

        // Google Maps URL: destination is last stop, waypoints are intermediate
        let destination = "\(coords.last!.latitude),\(coords.last!.longitude)"
        var urlString = "comgooglemaps://?daddr=\(destination)&directionsmode=driving"

        if coords.count > 1 {
            let waypoints = coords.dropLast().map { "\($0.latitude),\($0.longitude)" }
            urlString += "&waypoints=\(waypoints.joined(separator: "|"))"
        }

        // Try Google Maps app first, fall back to web
        if let url = URL(string: urlString), UIApplication.shared.canOpenURL(url) {
            UIApplication.shared.open(url)
        } else {
            // Fallback to Google Maps web
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
        "\(formatTime(route.expectedTravelTime)) · \(formatDistance(route.distance)) · Drive"
    }

    private func formatTime(_ seconds: TimeInterval) -> String {
        let minutes = Int(seconds) / 60
        if minutes < 60 {
            return "\(minutes) min"
        }
        let hours = minutes / 60
        let remainingMinutes = minutes % 60
        return "\(hours)h \(remainingMinutes)m"
    }

    private func formatDistance(_ meters: Double) -> String {
        let miles = meters / 1609.34
        if miles < 0.1 {
            return "\(Int(meters)) m"
        }
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
                // Balloon body
                Circle()
                    .fill(Theme.statusColor(for: lead.status))
                    .frame(width: 36, height: 36)
                    .shadow(color: .black.opacity(0.3), radius: 4, y: 2)

                // Stop number or business icon
                if let number = stopNumber {
                    Text("\(number)")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(.white)
                } else {
                    Image(systemName: lead.businessIcon)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(.white)
                }
            }
            // Triangle pointer
            PinPointer()
                .fill(Theme.statusColor(for: lead.status))
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
        VStack(alignment: .leading, spacing: 10) {
            // Drag indicator
            HStack {
                Spacer()
                RoundedRectangle(cornerRadius: 2)
                    .fill(Theme.textMuted.opacity(0.4))
                    .frame(width: 36, height: 4)
                Spacer()
            }
            .padding(.bottom, 2)

            // Header: icon + name + dismiss
            HStack(alignment: .top, spacing: 12) {
                // Business type icon
                Image(systemName: lead.businessIcon)
                    .font(.system(size: 18, weight: .medium))
                    .foregroundStyle(Color(hex: "#5B7B9D"))
                    .frame(width: 40, height: 40)
                    .background(Color(hex: "#5B7B9D").opacity(0.1))
                    .clipShape(RoundedRectangle(cornerRadius: 10))

                VStack(alignment: .leading, spacing: 3) {
                    Text(lead.businessName)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Theme.textPrimary)
                        .lineLimit(1)

                    // Metadata line
                    HStack(spacing: 4) {
                        Text(lead.businessType)
                            .font(.system(size: 12))
                            .foregroundStyle(Theme.textSecondary)

                        Text("·")
                            .foregroundStyle(Theme.textMuted)

                        Text(lead.postcode)
                            .font(.system(size: 12))
                            .foregroundStyle(Theme.textSecondary)

                        if let rating = lead.googleRating {
                            Text("·")
                                .foregroundStyle(Theme.textMuted)
                            HStack(spacing: 2) {
                                Image(systemName: "star.fill")
                                    .font(.system(size: 9))
                                    .foregroundStyle(Color(hex: "#B8922A"))
                                Text(String(format: "%.1f", rating))
                                    .font(.system(size: 12, weight: .medium))
                                    .foregroundStyle(Theme.textSecondary)
                                if let count = lead.googleReviewCount {
                                    Text("(\(count))")
                                        .font(.system(size: 11))
                                        .foregroundStyle(Theme.textMuted)
                                }
                            }
                        }
                    }
                }

                Spacer()

                Button(action: onDismiss) {
                    Image(systemName: "xmark")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(Theme.textMuted)
                        .padding(6)
                        .background(Theme.surfaceElevated)
                        .clipShape(Circle())
                }
                .buttonStyle(.plain)
            }

            // Status + contact
            HStack(spacing: 10) {
                StatusPill(status: lead.status)

                if let person = lead.contactPerson {
                    HStack(spacing: 3) {
                        Image(systemName: "person.fill")
                            .font(.system(size: 10))
                            .foregroundStyle(Theme.textMuted)
                        Text(person)
                            .font(.system(size: 12))
                            .foregroundStyle(Theme.textSecondary)
                        if let role = lead.contactRole {
                            Text("· \(role)")
                                .font(.system(size: 12))
                                .foregroundStyle(Theme.textMuted)
                        }
                    }
                }

                Spacer()
            }

            Divider().overlay(Theme.border)

            // Action buttons
            HStack(spacing: 8) {
                // Directions
                Button(action: onDirections) {
                    HStack(spacing: 4) {
                        Image(systemName: "arrow.triangle.turn.up.right.circle")
                            .font(.system(size: 13))
                        Text("Directions")
                            .font(.system(size: 13, weight: .medium))
                    }
                    .foregroundStyle(Theme.accent)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 7)
                    .background(Theme.accent.opacity(0.1))
                    .clipShape(RoundedRectangle(cornerRadius: Theme.radiusButton))
                    .overlay(
                        RoundedRectangle(cornerRadius: Theme.radiusButton)
                            .stroke(Theme.accent.opacity(0.3), lineWidth: Theme.borderWidth)
                    )
                }
                .buttonStyle(.plain)

                // Call (if phone available)
                if let phone = lead.phone, !phone.isEmpty {
                    Button {
                        let cleaned = phone.replacingOccurrences(of: " ", with: "")
                        if let url = URL(string: "tel:\(cleaned)") {
                            UIApplication.shared.open(url)
                        }
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "phone.fill")
                                .font(.system(size: 12))
                            Text("Call")
                                .font(.system(size: 13, weight: .medium))
                        }
                        .foregroundStyle(Theme.statusSold)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 7)
                        .background(Theme.statusSold.opacity(0.1))
                        .clipShape(RoundedRectangle(cornerRadius: Theme.radiusButton))
                        .overlay(
                            RoundedRectangle(cornerRadius: Theme.radiusButton)
                                .stroke(Theme.statusSold.opacity(0.3), lineWidth: Theme.borderWidth)
                        )
                    }
                    .buttonStyle(.plain)
                }

                Spacer()

                // View detail
                NavigationLink(destination: LeadDetailView(lead: lead)) {
                    HStack(spacing: 4) {
                        Text("View")
                            .font(.system(size: 13, weight: .semibold))
                        Image(systemName: "chevron.right")
                            .font(.system(size: 10, weight: .bold))
                    }
                    .foregroundStyle(.white)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 7)
                    .background(Theme.accent)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.radiusButton))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(14)
        .background(Theme.surface)
        .clipShape(RoundedRectangle(cornerRadius: Theme.radiusCard))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.radiusCard)
                .stroke(Theme.border, lineWidth: Theme.borderWidth)
        )
        .offset(y: dragOffset)
        .gesture(
            DragGesture()
                .onChanged { value in
                    if value.translation.height > 0 {
                        dragOffset = value.translation.height
                    }
                }
                .onEnded { value in
                    if value.translation.height > 60 {
                        onDismiss()
                    }
                    dragOffset = 0
                }
        )
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
