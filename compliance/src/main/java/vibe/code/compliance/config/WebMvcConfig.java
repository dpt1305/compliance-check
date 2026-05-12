package vibe.code.compliance.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.io.File;

@Configuration
public class WebMvcConfig implements WebMvcConfigurer {

    @Value("${storage.image.path:./data/images}")
    private String imageStoragePath;

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        String absolutePath = new File(imageStoragePath).getAbsolutePath();
        registry.addResourceHandler("/images/**")
                .addResourceLocations("file:///" + absolutePath.replace("\\", "/") + "/");
    }
}
