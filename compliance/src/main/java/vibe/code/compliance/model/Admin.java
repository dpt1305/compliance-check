package vibe.code.compliance.model;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class Admin {

    private Long id;
    private String username;
    private String password;
    private String email;
    private Boolean active = true;
}
