package vibe.code.compliance.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import vibe.code.compliance.model.Submission;

import java.util.List;

public interface SubmissionRepository extends JpaRepository<Submission, Long> {
    List<Submission> findByAccount(String account);
    List<Submission> findByStatus(Submission.SubmissionStatus status);
}
