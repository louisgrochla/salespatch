import Foundation
import Combine
import Security
import SwiftData

// MARK: — AuthStore  (Observable singleton)
final class AuthStore: ObservableObject {
    static let shared = AuthStore()

    @Published var isAuthenticated: Bool = false
    @Published var isUnlocked: Bool = false
    @Published var currentUser: User?
    @Published var pendingBiometricPrompt: Bool = false

    private let tokenKey = "salesflow_auth_token"
    private let userKey  = "salesflow_user"
    private let pinKey   = "salesflow_user_pin"
    private let biometricKey = "salesflow_biometric_enabled"
    /// Tracks which user the local SwiftData store last belonged to. When
    /// a different user signs in (or the same device gets handed over) we
    /// must wipe the store — otherwise SP A's leads + follow-ups bleed
    /// into SP B's session.
    private let lastUserIdKey = "salesflow_last_user_id"

    // Keychain-backed token property
    var token: String? {
        get { KeychainHelper.read(key: tokenKey) }
        set {
            if let value = newValue {
                KeychainHelper.save(key: tokenKey, value: value)
            } else {
                KeychainHelper.delete(key: tokenKey)
            }
        }
    }

    // Stored PIN (keychain) for unlock verification
    var storedPIN: String? {
        get { KeychainHelper.read(key: pinKey) }
        set {
            if let value = newValue {
                KeychainHelper.save(key: pinKey, value: value)
            } else {
                KeychainHelper.delete(key: pinKey)
            }
        }
    }

    // Biometric preference (UserDefaults — not sensitive)
    var biometricEnabled: Bool {
        get { UserDefaults.standard.bool(forKey: biometricKey) }
        set { UserDefaults.standard.set(newValue, forKey: biometricKey) }
    }

    private init() {
        // Restore session if a token exists; otherwise the app lands on
        // LoginView. No auto-login — users must authenticate with real
        // credentials created by an admin (or via SignUpView).
        if let savedToken = token {
            APIClient.shared.token = savedToken
            isAuthenticated = true
            // Only require unlock if a PIN was previously saved
            isUnlocked = (storedPIN == nil && !biometricEnabled)
            if let data = UserDefaults.standard.data(forKey: userKey),
               let user = try? JSONDecoder().decode(User.self, from: data) {
                currentUser = user
            }
        }
    }

    /// One-tap login as the shared "Demo Account" via /api/auth/demo.
    /// Useful for backend smoke-testing; exposed via a button on LoginView.
    @MainActor
    func signInAsDemo() async throws {
        let response = try await APIClient.shared.demoLogin()
        storedPIN = nil // demo doesn't carry a local PIN
        persist(token: response.token, user: response.user)
        isAuthenticated = true
        isUnlocked = true
    }

    @MainActor
    func signIn(name: String, pin: String) async throws {
        let response = try await APIClient.shared.login(name: name, pin: pin)
        storedPIN = pin
        persist(token: response.token, user: response.user)
        isAuthenticated = true
        isUnlocked = true
    }

    @MainActor
    func signUp(name: String, pin: String, phone: String, area: String) async throws {
        let response = try await APIClient.shared.signup(name: name, pin: pin, phone: phone, area: area)
        storedPIN = pin
        persist(token: response.token, user: response.user)
        isAuthenticated = true
        isUnlocked = true
    }

    @MainActor
    private func persist(token newToken: String, user: User?) {
        token = newToken
        APIClient.shared.token = newToken
        currentUser = user
        if let user, let data = try? JSONEncoder().encode(user) {
            UserDefaults.standard.set(data, forKey: userKey)
        }
    }

    /// Wipe every locally-cached row that belongs to a previous user
    /// session. Call this on sign-in (only if the user actually changed)
    /// and on sign-out. Touches: Lead (assigned leads + cached
    /// statuses), PendingPitch (offline pitch queue).
    ///
    /// Best-effort — failure here doesn't block the auth flow but means
    /// stale rows linger until the next call. The next login attempt
    /// will retry.
    @MainActor
    static func clearLocalSession(in context: ModelContext) {
        do {
            try context.delete(model: Lead.self)
            try context.delete(model: PendingPitch.self)
            try context.save()
        } catch {
            #if DEBUG
            print("[AuthStore] clearLocalSession failed: \(error.localizedDescription)")
            #endif
        }
    }

    /// Compare the freshly-logged-in user with the previous session's
    /// user. If different (or first login on this device), wipe the
    /// local SwiftData store so the new user doesn't see the previous
    /// SP's leads.
    @MainActor
    func handleUserChange(in context: ModelContext) {
        let newUserId = currentUser?.id
        let prevUserId = UserDefaults.standard.string(forKey: lastUserIdKey)
        if newUserId != prevUserId {
            Self.clearLocalSession(in: context)
        }
        if let newUserId {
            UserDefaults.standard.set(newUserId, forKey: lastUserIdKey)
        } else {
            UserDefaults.standard.removeObject(forKey: lastUserIdKey)
        }
    }

    @MainActor
    func unlock() {
        isUnlocked = true
    }

    @MainActor
    func unlockWithPIN(_ pin: String) {
        if pin == storedPIN {
            isUnlocked = true
        }
        // If wrong, caller should handle (PINKeypadView shake)
    }

    @MainActor
    func signOut() {
        token = nil
        storedPIN = nil
        biometricEnabled = false
        APIClient.shared.token = nil
        currentUser = nil
        UserDefaults.standard.removeObject(forKey: userKey)
        isAuthenticated = false
        isUnlocked = false
    }
}

// MARK: — KeychainHelper
private enum KeychainHelper {
    static func save(key: String, value: String) {
        let data = Data(value.utf8)
        let query: [String: Any] = [
            kSecClass as String:       kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecValueData as String:   data
        ]
        SecItemDelete(query as CFDictionary)
        SecItemAdd(query as CFDictionary, nil)
    }

    static func read(key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String:       kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecReturnData as String:  true,
            kSecMatchLimit as String:  kSecMatchLimitOne
        ]
        var result: AnyObject?
        SecItemCopyMatching(query as CFDictionary, &result)
        guard let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func delete(key: String) {
        let query: [String: Any] = [
            kSecClass as String:       kSecClassGenericPassword,
            kSecAttrAccount as String: key
        ]
        SecItemDelete(query as CFDictionary)
    }
}
