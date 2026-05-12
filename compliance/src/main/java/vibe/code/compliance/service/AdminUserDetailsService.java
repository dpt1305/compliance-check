package vibe.code.compliance.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;
// import vibe.code.compliance.repository.AdminRepository; // COMMENTED OUT

import java.io.IOException;
import java.util.List;

@Service
@RequiredArgsConstructor
@Slf4j
public class AdminUserDetailsService implements UserDetailsService {

    // private final AdminRepository adminRepository; // COMMENTED OUT - Using JSON storage
    private final AdminJsonStorageService adminJsonStorageService;

    @Override
    public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
        try {
            return adminJsonStorageService.findByUsername(username)
                    .map(admin -> new User(
                            admin.getUsername(),
                            admin.getPassword(),
                            List.of(new SimpleGrantedAuthority("ROLE_ADMIN"))
                    ))
                    .orElseThrow(() -> new UsernameNotFoundException("Admin not found: " + username));
        } catch (IOException e) {
            log.error("Error reading admin from JSON storage: {}", e.getMessage());
            throw new UsernameNotFoundException("Error loading admin: " + e.getMessage(), e);
        }
    }
}
