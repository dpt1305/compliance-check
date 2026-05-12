package vibe.code.compliance.controller;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import vibe.code.compliance.dto.AdminUserDTO;
import vibe.code.compliance.dto.CheckInTableDTO;
import vibe.code.compliance.model.Submission;
import vibe.code.compliance.service.AdminService;
import vibe.code.compliance.service.ExcelExportService;
import vibe.code.compliance.service.NotificationService;

import java.io.IOException;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
public class AdminController {

    private final AdminService adminService;
    private final ExcelExportService excelExportService;
    private final NotificationService notificationService;

    @GetMapping("/submissions")
    public ResponseEntity<List<AdminUserDTO>> listSubmissions() {
        return ResponseEntity.ok(adminService.listAllSubmissions());
    }

    @GetMapping("/submissions/{id}")
    public ResponseEntity<AdminUserDTO> getSubmission(@PathVariable Long id) {
        return ResponseEntity.ok(adminService.getSubmission(id));
    }

    @PutMapping("/submissions/{id}")
    public ResponseEntity<AdminUserDTO> updateSubmission(
            @PathVariable Long id,
            @RequestBody Map<String, String> body) {
        String statusStr = body.get("status");
        if (statusStr == null) {
            throw new IllegalArgumentException("Field 'status' is required");
        }
        Submission.SubmissionStatus status;
        try {
            status = Submission.SubmissionStatus.valueOf(statusStr.toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("Invalid status: " + statusStr + ". Allowed: PENDING, APPROVED, REJECTED");
        }
        return ResponseEntity.ok(adminService.updateSubmission(id, status));
    }

    @DeleteMapping("/submissions/{id}")
    public ResponseEntity<Void> deleteSubmission(@PathVariable Long id) {
        adminService.deleteSubmission(id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/checkin-table")
    public ResponseEntity<List<CheckInTableDTO>> getCheckInTable() {
        return ResponseEntity.ok(adminService.getCheckInTable());
    }

    @GetMapping("/summary")
    public ResponseEntity<Map<String, Long>> getStatusSummary() {
        return ResponseEntity.ok(adminService.getStatusSummary());
    }

    @GetMapping("/export")
    public ResponseEntity<byte[]> exportExcel() throws IOException {
        byte[] data = excelExportService.generateReport();
        String filename = "compliance-report-"
                + LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMdd-HHmm"))
                + ".xlsx";
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=" + filename)
                .contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                .body(data);
    }

    @PostMapping("/notify")
    public ResponseEntity<Map<String, String>> sendNotification(@RequestBody Map<String, String> body) {
        String message = body.getOrDefault("message", "Compliance deadline reminder — please submit your documents.");
        notificationService.sendDeadlineReminder(message);
        return ResponseEntity.ok(Map.of("message", "Notification sent", "mode", "teams"));
    }
}
