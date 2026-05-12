package vibe.code.compliance.util;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;

@Component
public class FileStorageUtil {

    @Value("${storage.image.path}")
    private String storagePath;

    @Value("${storage.image.base-url}")
    private String baseUrl;

    public String store(MultipartFile file, String savedName) throws IOException {
        Path storageDir = Paths.get(storagePath).normalize().toAbsolutePath();
        if (!Files.exists(storageDir)) {
            Files.createDirectories(storageDir);
        }

        Path destination = storageDir.resolve(savedName).normalize().toAbsolutePath();

        // Prevent path traversal - check that destination is within storageDir
        if (!destination.startsWith(storageDir)) {
            throw new SecurityException("Attempted path traversal in filename: " + savedName);
        }

        Files.copy(file.getInputStream(), destination, StandardCopyOption.REPLACE_EXISTING);
        return destination.toString();
    }

    public String getPublicUrl(String savedName) {
        return baseUrl.endsWith("/") ? baseUrl + savedName : baseUrl + "/" + savedName;
    }

    public void delete(String savedName) throws IOException {
        Path storageDir = Paths.get(storagePath).normalize().toAbsolutePath();
        Path target = storageDir.resolve(savedName).normalize().toAbsolutePath();

        if (!target.startsWith(storageDir)) {
            throw new SecurityException("Attempted path traversal during delete: " + savedName);
        }

        Files.deleteIfExists(target);
    }
}
