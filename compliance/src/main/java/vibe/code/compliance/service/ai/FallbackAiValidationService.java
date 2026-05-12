package vibe.code.compliance.service.ai;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Service;
import vibe.code.compliance.dto.AiValidationResult;

import java.util.List;

@Service
@Primary
@RequiredArgsConstructor
@Slf4j
public class FallbackAiValidationService implements AiValidationService {

    private final AiProviderOrderConfig providerOrderConfig;

    @Override
    public AiValidationResult validate(byte[] imageBytes, String mimeType, String expectedType) {
        List<AiProviderOrderConfig.AiProviderEntry> providers = providerOrderConfig.getOrderedProviders();

        if (providers.isEmpty()) {
            log.error("No AI providers configured");
            return AiValidationResult.failure("No AI providers configured");
        }

        AiValidationResult lastResult = null;
        for (AiProviderOrderConfig.AiProviderEntry provider : providers) {
            try {
                log.debug("Attempting AI validation with provider: {}", provider.getName());
                lastResult = provider.getService().validate(imageBytes, mimeType, expectedType);
                log.info("Successfully validated with provider: {}", provider.getName());
                return lastResult;
            } catch (AiUnavailableException e) {
                log.warn("{} unavailable ({}), trying next provider...", provider.getName(), e.getMessage());
            }
        }

        if (lastResult != null) {
            return lastResult;
        }
        return AiValidationResult.failure("All AI providers unavailable or failed");
    }
}

