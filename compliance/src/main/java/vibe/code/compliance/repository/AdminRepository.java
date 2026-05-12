package vibe.code.compliance.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import vibe.code.compliance.model.Admin;

import java.util.Optional;

public interface AdminRepository extends JpaRepository<Admin, Long> {
    Optional<Admin> findByUsername(String username);
}
