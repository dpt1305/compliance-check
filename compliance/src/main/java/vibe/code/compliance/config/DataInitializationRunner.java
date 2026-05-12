package vibe.code.compliance.config;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import vibe.code.compliance.model.Admin;
import vibe.code.compliance.service.AdminJsonStorageService;

@Component
@RequiredArgsConstructor
@Slf4j
public class DataInitializationRunner implements CommandLineRunner {

    private final AdminJsonStorageService adminJsonStorageService;
    private final PasswordEncoder passwordEncoder;

    @Override
    public void run(String... args) throws Exception {
        initializeDefaultAdmin();
    }

    private void initializeDefaultAdmin() throws Exception {
        try {
            // Check if default admin already exists
            var existingAdmin = adminJsonStorageService.findByUsername("admin");
            if (existingAdmin.isPresent()) {
                Admin admin = existingAdmin.get();
                if (admin.getPassword() != null && !admin.getPassword().isEmpty()) {
                    log.info("Default admin user already exists with password, skipping initialization");
                    return;
                }
                // If admin exists but password is null, update it
                log.info("Found admin without password, updating...");
                admin.setPassword(passwordEncoder.encode("Admin@123"));
                adminJsonStorageService.save(admin);
                log.info("Admin password updated");
                return;
            }

            // Create default admin from CLAUDE.md
            Admin defaultAdmin = new Admin();
            defaultAdmin.setUsername("admin");
            defaultAdmin.setEmail("admin@compliance.local");
            // Hash the password: Admin@123
            String encodedPassword = passwordEncoder.encode("Admin@123");
            defaultAdmin.setPassword(encodedPassword);
            defaultAdmin.setActive(true);

            adminJsonStorageService.save(defaultAdmin);
            log.info("Default admin user initialized successfully");
            log.info("Username: admin | Email: admin@compliance.local");
            log.info("⚠️  DEFAULT PASSWORD IS SET: Change this password after first login in production!");
        } catch (Exception e) {
            log.error("Error initializing default admin user: {}", e.getMessage(), e);
            // Don't fail startup, just log warning
        }
    }
}
