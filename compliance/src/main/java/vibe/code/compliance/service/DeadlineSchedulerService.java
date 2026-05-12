package vibe.code.compliance.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import vibe.code.compliance.model.Submission;
// import vibe.code.compliance.repository.SubmissionRepository; // COMMENTED OUT

import java.io.IOException;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;

@Service
@Slf4j
@RequiredArgsConstructor
public class DeadlineSchedulerService {

    // private final SubmissionRepository submissionRepository; // COMMENTED OUT - Using JSON storage
    private final JsonStorageService jsonStorageService;
    private final NotificationService notificationService;

    @Value("${notification.deadline-date:}")
    private String deadlineDateStr;

    @Value("${notification.reminder-days-before:7}")
    private int reminderDaysBefore;

    @Value("${notification.reminder-message:Please submit your compliance documents before the deadline.}")
    private String reminderMessage;

    @Scheduled(cron = "0 0 9 * * MON-FRI")
    public void checkDeadlines() {
        if (deadlineDateStr == null || deadlineDateStr.isBlank()) {
            log.debug("No deadline date configured — skipping scheduled reminder check");
            return;
        }

        try {
            LocalDate deadline = LocalDate.parse(deadlineDateStr, DateTimeFormatter.ISO_LOCAL_DATE);
            LocalDate today = LocalDate.now();
            long daysUntilDeadline = today.until(deadline).getDays();

            if (daysUntilDeadline < 0) {
                log.info("Deadline {} has passed — no reminders sent", deadlineDateStr);
                return;
            }

            if (daysUntilDeadline <= reminderDaysBefore) {
                try {
                    List<String> pendingAccounts = jsonStorageService
                            .findByStatus(Submission.SubmissionStatus.PENDING)
                            .stream()
                            .map(Submission::getAccount)
                            .distinct()
                            .toList();

                    String message = reminderMessage + " Deadline: " + deadlineDateStr
                            + " (" + daysUntilDeadline + " day(s) remaining).";
                    notificationService.sendDeadlineReminder(message, pendingAccounts);
                    log.info("Deadline reminder sent. Days remaining: {}, pending users: {}",
                            daysUntilDeadline, pendingAccounts.size());
                } catch (IOException e) {
                    log.error("Error reading submissions from JSON storage: {}", e.getMessage());
                }
            }
        } catch (Exception e) {
            log.error("Error in deadline scheduler: {}", e.getMessage());
        }
    }
}
