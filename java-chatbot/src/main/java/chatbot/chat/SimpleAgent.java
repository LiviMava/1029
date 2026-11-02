package chatbot.chat;

import org.springframework.ai.chat.messages.*;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.openai.*;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;

/** Per-provider conversation. The caller serializes access to each instance. */
public class SimpleAgent {
    private final ChatModel model;
    private final List<Message> conversation = new ArrayList<>();

    public SimpleAgent(String apiKey, String baseUrl, String model) {
        this(OpenAiChatModel.builder().options(OpenAiChatOptions.builder()
                .apiKey(apiKey).baseUrl(baseUrl).model(model).build()).build());
    }

    SimpleAgent(ChatModel model) { this.model = model; }

    /** Callback runs on the caller thread; failure closes the stream and omits the partial reply. */
    public String chat(String userMessage, Consumer<String> onDelta) {
        conversation.add(new UserMessage(userMessage));
        StringBuilder reply = new StringBuilder();
        try (var stream = model.stream(new Prompt(List.copyOf(conversation))).toStream(1)) {
            stream.forEach(response -> {
                var result = response.getResult();
                if (result == null || result.getOutput().getText() == null) return;
                String text = result.getOutput().getText();
                if (text.isEmpty()) return;
                onDelta.accept(text);
                reply.append(text);
            });
        }
        conversation.add(new AssistantMessage(reply.toString()));
        return reply.toString();
    }
}
