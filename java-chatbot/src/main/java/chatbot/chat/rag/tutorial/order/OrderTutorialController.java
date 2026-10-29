package chatbot.chat.rag.tutorial.order;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/tutorial/orders")
@ConditionalOnProperty(name="rag.tutorial.enabled",havingValue="true")
public class OrderTutorialController {
    public record Create(@NotBlank @Size(max=500) String question) {}
    private final OrderTutorialService service;
    public OrderTutorialController(OrderTutorialService service){this.service=service;}
    private String owner(HttpServletRequest request){return request.getSession(true).getId();}
    @GetMapping("/config") public Object config(){return service.config();}
    @GetMapping("/code/{node}") public Object code(@PathVariable String node){return service.code(node);}
    @PostMapping("/runs") public Object create(@RequestBody @Valid Create body,HttpServletRequest request){return service.create(owner(request),body.question());}
    @GetMapping("/runs/{id}") public Object state(@PathVariable String id,HttpServletRequest request){return service.state(owner(request),id);}
    @PostMapping("/runs/{id}/{node}") public Object execute(@PathVariable String id,@PathVariable String node,HttpServletRequest request){return service.execute(owner(request),id,node);}
    @DeleteMapping("/runs/{id}") public Object delete(@PathVariable String id,HttpServletRequest request){return service.delete(owner(request),id);}
}
