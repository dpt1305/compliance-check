package vibe.code.compliance.service.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.HttpServerErrorException;
import org.springframework.web.client.RestClient;
import vibe.code.compliance.dto.AiValidationResult;

import java.util.Base64;
import java.util.List;
import java.util.Map;

@Service
@Slf4j
public class ChatGptValidationService implements AiValidationService {

    private static final String GENERIC_PROMPT = """
            You are a compliance image validator.
            Given an image and an expected type, determine:
            1. Does the image clearly show the expected item?
            2. Is the image clear, unobstructed, and complete?
            3. Confidence score (0-100)

            Respond ONLY with valid JSON (no markdown):
            {"valid":true|false,"matchesType":true|false,"confidence":0-100,"reason":"short explanation","failedChecks":[],"guidelines":[],"suggestion":"optional tip or null"}
            """;

    private static final String WINDOWS_PROMPT = """
            You are a compliance image validator for Windows device verification.

            The submitted screenshot MUST satisfy the following checks:

            OPTION A — SEED Dashboard (preferred):
            1. SEED DASHBOARD — A SEED dashboard is visible showing 4 counter values (e.g., "Malware Alerts: X", "Compliance Checks: X", "SEED Configuration: X", "Operating System: X")
               - The 4 counters are READABLE with full numbers visible (no truncation)
               - Any counter values (0, 19, 100, etc.) are acceptable — does NOT need to be "ok" or "no action"
               - If these 4 counters are present and readable, valid=true

            OPTION B — Trellix (fallback if no SEED Dashboard):
            1. CLOCK      — System clock (time) is visible in the bottom-right corner of the Windows taskbar with readable timestamp.
            2. UPDATE     — Windows Update screen/panel is visible and clearly shows the text "You're up to date".
            3. DEVICE INFO — BOTH of the following fields must be visible ANYWHERE in the screenshot with FULL values (no ellipsis, no truncation):
                            a. Device name (hostname/computer name)
                            b. Device serial number
            4. TRELLIX STATUS — Trellix endpoint security is visible showing "trellix status: ok" or "turned on" + "no action needed".

            If SEED dashboard is present, use OPTION A (only needs 4 readable counters).
            If no SEED dashboard, use OPTION B (all 4 Trellix checks must pass).

            ALSO EXTRACT: device serial number and device name visible anywhere in the screenshot.
            Example: if "Device: LAPTOP-ABC123" or "Serial: 5CD3093KYC" is visible, extract it.

            Respond ONLY with valid JSON (no markdown):
            {
              "valid": true|false,
              "matchesType": true|false,
              "confidence": 0-100,
              "reason": "one-sentence summary of compliance status",
              "deviceSerial": "extracted device serial from image or null",
              "deviceName": "extracted device name/hostname from image or null",
              "seedDashboard": {
                "malwareAlerts": "X value from SEED dashboard or null",
                "complianceChecks": "X value from SEED dashboard or null",
                "seedConfiguration": "X value from SEED dashboard or null",
                "operatingSystem": "X value from SEED dashboard or null"
              },
              "checklist": {
                "hasClock": true|false,
                "hasWindowsUpdate": true|false,
                "hasDeviceName": true|false,
                "hasDeviceSerial": true|false,
                "hasDashboard": true|false
              },
              "failedChecks": ["description of each failed check, empty if all pass"],
              "guidelines": ["actionable instruction per failed check in same order, empty if all pass"],
              "suggestion": "optional tip or null"
            }
            """;

    private static final String MAC_PROMPT = """
            You are a compliance image validator for macOS device verification.

            The submitted screenshot MUST satisfy the following checks (at least ONE validation path must pass):

            PATH 1 — SEED Dashboard (preferred):
            1. SEED DASHBOARD — A SEED dashboard is visible showing:
                              a. Full device name (hostname) — fully readable, not truncated
                              b. Device serial number — fully readable, not truncated
                              c. Four counters/metrics (e.g., compliance score, patch status, threat count, etc.)
            2. TIMESTAMP      — A readable timestamp is visible in the top-right corner of the screen.
            Result: valid=true if BOTH SEED dashboard elements AND timestamp are present.

            PATH 2 — Trellix Fallback:
            If SEED dashboard is NOT visible, check for Trellix:
            1. TRELLIX         — Trellix endpoint security is visible with status showing "trellix status: ok" (or equivalent "ok" status text).
            Result: valid=true if Trellix status is visible and shows "ok".

            ADDITIONAL:
            - Mac system information (System Preferences > About This Mac) showing Mac model name and serial number is a positive indicator.
            - If BOTH SEED and Trellix are absent, check for other system management dashboards (Intune, JumpCloud, etc.) showing device info + status.

            Evaluate each path independently. At least one path must FULLY pass for valid=true.

            Respond ONLY with valid JSON (no markdown):
            {
              "valid": true|false,
              "matchesType": true|false,
              "confidence": 0-100,
              "reason": "one-sentence summary of which validation path passed or why it failed",
              "checklist": {
                "hasSeedDashboard": true|false,
                "hasTrellix": true|false,
                "hasTimestamp": true|false,
                "hasMacInfo": true|false
              },
              "failedChecks": ["description of each failed check, empty if all pass"],
              "guidelines": ["actionable instruction per failed check in same order, empty if all pass"],
              "suggestion": "optional tip or null"
            }
            """;

    private static final String THIN_PROMPT = """
            You are a compliance image validator for thin client device verification.

            Thin clients run Windows. The submitted screenshot MUST satisfy these checks:
            1. WINDOWS ENVIRONMENT — The screenshot shows a Windows desktop/taskbar (not a software screenshot from another OS).
            2. TRELLIX STATUS — Trellix endpoint security is visible and shows "ok" status (or "trellix status: ok", "turned on", "no action needed", or similar positive indicators).

            Both checks must pass for valid=true. Device names, serial numbers, Windows Update, clock, and other details are optional.

            Respond ONLY with valid JSON (no markdown):
            {
              "valid": true|false,
              "matchesType": true|false,
              "confidence": 0-100,
              "reason": "one-sentence summary",
              "checklist": {
                "hasTrellix": true|false
              },
              "failedChecks": ["description of each failed check, empty if all pass"],
              "guidelines": ["actionable instruction per failed check in same order, empty if all pass"],
              "suggestion": "optional tip or null"
            }
            """;

    @Value("${ai.chatgpt.api-key:}")
    private String apiKey;

    @Value("${ai.chatgpt.endpoint:https://aiportalapi.stu-platform.live/use}")
    private String endpoint;

    @Value("${ai.chatgpt.model:gpt-4o-mini}")
    private String model;

    private final RestClient restClient;
    private final ObjectMapper objectMapper;

    public ChatGptValidationService(ObjectMapper objectMapper) {
        this.restClient = RestClient.create();
        this.objectMapper = objectMapper;
    }

    private String selectPrompt(String expectedType) {
        if ("windows".equalsIgnoreCase(expectedType)) return WINDOWS_PROMPT;
        if ("mac".equalsIgnoreCase(expectedType)) return MAC_PROMPT;
        if ("thin".equalsIgnoreCase(expectedType)) return THIN_PROMPT;
        return GENERIC_PROMPT;
    }

    @Override
    public AiValidationResult validate(byte[] imageBytes, String mimeType, String expectedType) {
        if (apiKey == null || apiKey.isBlank()) {
            throw new AiUnavailableException("ChatGPT API key not configured");
        }

        try {
            String base64Image = Base64.getEncoder().encodeToString(imageBytes);
            String systemPrompt = selectPrompt(expectedType);
            String userText = "Expected submission type: " + expectedType + ". Validate this image.";

            Map<String, Object> body = Map.of(
                    "model", model,
                    "messages", List.of(
                            Map.of("role", "system", "content", systemPrompt),
                            Map.of("role", "user", "content", List.of(
                                    Map.of("type", "text", "text", userText),
                                    Map.of("type", "image_url", "image_url", Map.of(
                                            "url", "data:" + mimeType + ";base64," + base64Image
                                    ))
                            ))
                    ),
                    "max_tokens", 512
            );

            String responseBody = restClient.post()
                    .uri(endpoint + "/v1/chat/completions")
                    .header("Authorization", "Bearer " + apiKey)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .body(String.class);

            return parseResponse(responseBody);

        } catch (HttpClientErrorException e) {
            if (e.getStatusCode().value() == 429) {
                throw new AiUnavailableException("ChatGPT rate limit exceeded", e);
            }
            throw new AiUnavailableException("ChatGPT API error: " + e.getMessage(), e);
        } catch (HttpServerErrorException e) {
            throw new AiUnavailableException("ChatGPT server error: " + e.getMessage(), e);
        } catch (Exception e) {
            throw new AiUnavailableException("ChatGPT AI validation failed: " + e.getMessage(), e);
        }
    }

    private AiValidationResult parseResponse(String responseBody) throws Exception {
        JsonNode root = objectMapper.readTree(responseBody);
        String text = root.path("choices").get(0)
                .path("message").path("content").asText();
        return objectMapper.readValue(stripMarkdown(text), AiValidationResult.class);
    }

    private String stripMarkdown(String text) {
        if (text == null) return "{}";
        String trimmed = text.trim();
        if (trimmed.startsWith("```")) {
            int start = trimmed.indexOf('\n') + 1;
            int end = trimmed.lastIndexOf("```");
            trimmed = (end > start) ? trimmed.substring(start, end).trim() : trimmed;
        }
        return trimmed;
    }
}
