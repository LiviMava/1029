package chatbot.chat.rag.tutorial.classic;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.web.bind.annotation.*;
@RestController
@RequestMapping("/api/v1/tutorial/classic")
@ConditionalOnProperty(name="rag.tutorial.enabled",havingValue="true")
public class ClassicRagController {
    public record Create(@NotBlank @Size(max=500) String question){}
    private final ClassicRagService service;
    public ClassicRagController(ClassicRagService service){this.service=service;}
    private String owner(HttpServletRequest r){return r.getSession(true).getId();}
    @GetMapping("/config") public Object config(){return service.config();}
    @GetMapping("/code/{step}") public Object code(@PathVariable String step){return service.code(step);}
    @PostMapping("/runs") public Object create(@RequestBody @Valid Create body,HttpServletRequest r){return service.create(owner(r),body.question());}
    @GetMapping("/runs/{id}") public Object state(@PathVariable String id,HttpServletRequest r){return service.state(owner(r),id);}
    @PostMapping("/runs/{id}/{step}") public Object execute(@PathVariable String id,@PathVariable String step,HttpServletRequest r){return service.execute(owner(r),id,step);}
    @DeleteMapping("/runs/{id}") public Object delete(@PathVariable String id,HttpServletRequest r){return service.delete(owner(r),id);}
}
