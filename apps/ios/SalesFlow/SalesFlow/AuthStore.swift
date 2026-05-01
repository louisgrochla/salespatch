import Foundation
import Combine
import Security

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
