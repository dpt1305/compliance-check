package vibe.code.compliance.service.ai;

import lombok.Getter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.*;

@Component
@Getter
public class AiProviderOrderConfig {

    @Value("${ai.gemini.enabled:true}")
    private boolean geminiEnabled;

    @Value("${ai.gemini.order:0}")
    private int geminiOrder;

    @Value("${ai.chatgpt.enabled:true}")
    private boolean chatGptEnabled;

    @Value("${ai.chatgpt.order:1}")
    private int chatGptOrder;

    @Value("${ai.nvidia.enabled:true}")
    private boolean nvidiaEnabled;

    @Value("${ai.nvidia.order:2}")
    private int nvidiaOrder;

    private final GeminiValidationService geminiService;
    private final ChatGptValidationService chatGptService;
    private final NvidiaValidationService nvidiaService;

    public AiProviderOrderConfig(
            GeminiValidationService geminiService,
            ChatGptValidationService chatGptService,
            NvidiaValidationService nvidiaService) {
        this.geminiService = geminiService;
        this.chatGptService = chatGptService;
        this.nvidiaService = nvidiaService;
    }

    public List<AiProviderEntry> getOrderedProviders() {
        List<AiProviderEntry> providers = new ArrayList<>();

        if (geminiEnabled) {
            providers.add(new AiProviderEntry("gemini", geminiOrder, geminiService));
        }
        if (chatGptEnabled) {
            providers.add(new AiProviderEntry("chatgpt", chatGptOrder, chatGptService));
        }
        if (nvidiaEnabled) {
            providers.add(new AiProviderEntry("nvidia", nvidiaOrder, nvidiaService));
        }

        providers.sort(Comparator.comparingInt(AiProviderEntry::getOrder));
        return providers;
    }

    @Getter
    public static class AiProviderEntry {
        private final String name;
        private final int order;
        private final AiValidationService service;

        public AiProviderEntry(String name, int order, AiValidationService service) {
            this.name = name;
            this.order = order;
            this.service = service;
        }
    }
}
