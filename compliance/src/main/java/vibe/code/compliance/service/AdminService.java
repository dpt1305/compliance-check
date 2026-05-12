package vibe.code.compliance.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import vibe.code.compliance.dto.AdminUserDTO;
import vibe.code.compliance.dto.CheckInTableDTO;
import vibe.code.compliance.model.Submission;
// import vibe.code.compliance.repository.SubmissionRepository; // COMMENTED OUT

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class AdminService {

    // private final SubmissionRepository submissionRepository; // COMMENTED OUT - Using JSON storage
    private final JsonStorageService jsonStorageService;

    public List<AdminUserDTO> listAllSubmissions() {
        try {
            return jsonStorageService.findAll().stream()
                    .map(AdminUserDTO::from)
                    .toList();
        } catch (IOException e) {
            log.error("Error reading submissions from JSON storage: {}", e.getMessage());
            return List.of();
        }
    }

    public AdminUserDTO getSubmission(Long id) {
        try {
            return jsonStorageService.findById(id)
                    .map(AdminUserDTO::from)
                    .orElseThrow(() -> new IllegalArgumentException("Submission not found: " + id));
        } catch (IOException e) {
            throw new RuntimeException("Error reading from JSON storage: " + e.getMessage(), e);
        }
    }

    public AdminUserDTO updateSubmission(Long id, Submission.SubmissionStatus status) {
        try {
            Submission submission = jsonStorageService.findById(id)
                    .orElseThrow(() -> new IllegalArgumentException("Submission not found: " + id));
            submission.setStatus(status);
            return AdminUserDTO.from(jsonStorageService.save(submission));
        } catch (IOException e) {
            throw new RuntimeException("Error updating submission in JSON storage: " + e.getMessage(), e);
        }
    }

    public void deleteSubmission(Long id) {
        try {
            if (!jsonStorageService.existsById(id)) {
                throw new IllegalArgumentException("Submission not found: " + id);
            }
            jsonStorageService.delete(id);
        } catch (IOException e) {
            throw new RuntimeException("Error deleting from JSON storage: " + e.getMessage(), e);
        }
    }

    public List<CheckInTableDTO> getCheckInTable() {
        try {
            return jsonStorageService.findAll().stream()
                    .map(CheckInTableDTO::from)
                    .toList();
        } catch (IOException e) {
            log.error("Error reading submissions from JSON storage: {}", e.getMessage());
            return List.of();
        }
    }

    public Map<String, Long> getStatusSummary() {
        try {
            return jsonStorageService.findAll().stream()
                    .collect(Collectors.groupingBy(
                            s -> s.getStatus().name(),
                            Collectors.counting()
                    ));
        } catch (IOException e) {
            log.error("Error reading submissions from JSON storage: {}", e.getMessage());
            return Map.of();
        }
    }
}
