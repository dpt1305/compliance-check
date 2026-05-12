package vibe.code.compliance.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

@Service
@Slf4j
public class NotificationService {

    @Value("${notification.mode:teams}")
    private String mode;

    @Value("${notification.teams.webhook-url:}")
    private String teamsWebhookUrl;

    @Value("${notification.deadline-date:}")
    private String deadlineDate;

    private final RestClient restClient = RestClient.create();

    public void sendDeadlineReminder(String message) {
        if ("teams".equalsIgnoreCase(mode)) {
            sendTeamsNotification(message);
        } else {
            sendDirectNotification(message);
        }
    }

    public void sendDeadlineReminder(String message, List<String> pendingAccounts) {
        String fullMessage = message;
        if (!pendingAccounts.isEmpty()) {
            fullMessage += " Pending users (" + pendingAccounts.size() + "): " + String.join(", ", pendingAccounts);
        }
        sendDeadlineReminder(fullMessage);
    }

    private void sendTeamsNotification(String message) {
        if (teamsWebhookUrl == null || teamsWebhookUrl.isBlank()) {
            log.warn("Teams webhook URL not configured — notification not sent");
            return;
        }

        Map<String, Object> card = Map.of(
                "@type", "MessageCard",
                "@context", "http://schema.org/extensions",
                "themeColor", "FF6B35",
                "summary", "Compliance Deadline Reminder",
                "sections", List.of(Map.of(
                        "activityTitle", "Compliance Deadline Reminder",
                        "activitySubtitle", "Sent: " + LocalDate.now(),
                        "activityText", message,
                        "facts", List.of(
                                Map.of("name", "Deadline", "value", deadlineDate),
                                Map.of("name", "Mode", "value", "Teams Webhook")
                        )
                ))
        );

        try {
            restClient.post()
                    .uri(teamsWebhookUrl)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(card)
                    .retrieve()
                    .toBodilessEntity();
            log.info("Teams notification sent successfully");
        } catch (Exception e) {
            log.error("Failed to send Teams notification: {}", e.getMessage());
        }
    }

    private void sendDirectNotification(String message) {
        // Direct mode placeholder — extend with spring-boot-starter-mail for email support
        log.info("[DIRECT NOTIFICATION] {}", message);
    }
}
