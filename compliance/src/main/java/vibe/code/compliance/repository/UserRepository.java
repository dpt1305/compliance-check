package vibe.code.compliance.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import vibe.code.compliance.model.User;

import java.util.Optional;

public interface UserRepository extends JpaRepository<User, Long> {
    Optional<User> findByAccount(String account);
}
