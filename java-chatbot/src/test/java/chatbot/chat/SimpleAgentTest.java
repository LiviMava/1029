package chatbot.chat;

import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.model.*;
import org.springframework.ai.chat.prompt.Prompt;
import reactor.core.publisher.Flux;
import java.util.*;
import java.util.concurrent.atomic.AtomicBoolean;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class SimpleAgentTest {
    private ChatResponse response(String text) {
        return new ChatResponse(List.of(new Generation(new AssistantMessage(text))));
    }
    @Test void streamsInOrderAndCarriesHistory() {
        ChatModel model=mock(ChatModel.class);
        List<Prompt> prompts=new ArrayList<>();
        when(model.stream(any(Prompt.class))).thenAnswer(call->{
            prompts.add(call.getArgument(0));
            return Flux.just(new ChatResponse(List.of()),response("你"),response("好"));
        });
        var agent=new SimpleAgent(model);
        List<String> deltas=new ArrayList<>();
        assertEquals("你好",agent.chat("第一问",deltas::add));
        assertEquals(List.of("你","好"),deltas);
        agent.chat("第二问",text->{});
        assertEquals(List.of("第一问","你好","第二问"),
                prompts.get(1).getInstructions().stream().map(m->m.getText()).toList());
        assertEquals(1,prompts.get(0).getInstructions().size());
    }
    @Test void callbackFailureCancelsStreamAndDoesNotStorePartialReply() {
        ChatModel model=mock(ChatModel.class);
        AtomicBoolean cancelled=new AtomicBoolean();
        when(model.stream(any(Prompt.class))).thenReturn(
                Flux.concat(Flux.just(response("partial")),Flux.<ChatResponse>never()).doOnCancel(()->cancelled.set(true)));
        var agent=new SimpleAgent(model);
        assertThrows(IllegalStateException.class,()->agent.chat("first",text->{throw new IllegalStateException("disconnected");}));
        assertTrue(cancelled.get());
        when(model.stream(any(Prompt.class))).thenAnswer(call->{
            Prompt prompt=call.getArgument(0);
            assertEquals(List.of("first","retry"),prompt.getInstructions().stream().map(m->m.getText()).toList());
            return Flux.just(response("ok"));
        });
        assertEquals("ok",agent.chat("retry",text->{}));
    }
}
