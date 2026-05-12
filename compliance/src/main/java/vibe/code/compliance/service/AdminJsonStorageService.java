package vibe.code.compliance.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import vibe.code.compliance.model.Admin;

import java.io.File;
import java.io.IOException;
import java.util.*;

@Service
@Slf4j
@RequiredArgsConstructor
public class AdminJsonStorageService {

    private final ObjectMapper objectMapper;

    @Value("${storage.json.admin.path:./data/admins.json}")
    private String storagePath;

    private final Object lock = new Object();

    public Optional<Admin> findByUsername(String username) throws IOException {
        List<Admin> admins = loadAll();
        return admins.stream()
                .filter(a -> a.getUsername().equalsIgnoreCase(username))
                .findFirst();
    }

    public Optional<Admin> findById(Long id) throws IOException {
        List<Admin> admins = loadAll();
        return admins.stream()
                .filter(a -> a.getId().equals(id))
                .findFirst();
    }

    public List<Admin> findAll() throws IOException {
        return loadAll();
    }

    public Admin save(Admin admin) throws IOException {
        synchronized (lock) {
            List<Admin> admins = loadAll();

            if (admin.getId() == null || admin.getId() == 0) {
                admin.setId(generateNextId(admins));
            }

            // Remove old version if exists
            admins.removeIf(a -> a.getId().equals(admin.getId()));

            // Add new version
            admins.add(admin);

            saveAll(admins);
            log.info("Saved admin id={} username={} to JSON file", admin.getId(), admin.getUsername());
            return admin;
        }
    }

    public void delete(Long id) throws IOException {
        synchronized (lock) {
            List<Admin> admins = loadAll();
            admins.removeIf(a -> a.getId().equals(id));
            saveAll(admins);
            log.info("Deleted admin id={}", id);
        }
    }

    public boolean existsById(Long id) throws IOException {
        List<Admin> admins = loadAll();
        return admins.stream().anyMatch(a -> a.getId().equals(id));
    }

    private List<Admin> loadAll() throws IOException {
        File file = new File(storagePath);

        if (!file.exists()) {
            return new ArrayList<>();
        }

        try {
            Admin[] adminsArray = objectMapper.readValue(file, Admin[].class);
            return new ArrayList<>(Arrays.asList(adminsArray));
        } catch (IOException e) {
            log.warn("Error reading admin JSON storage file: {}, returning empty list", e.getMessage());
            return new ArrayList<>();
        }
    }

    private void saveAll(List<Admin> admins) throws IOException {
        File file = new File(storagePath);
        File parent = file.getParentFile();

        if (parent != null && !parent.exists()) {
            parent.mkdirs();
        }

        objectMapper.writerWithDefaultPrettyPrinter()
                .writeValue(file, admins);
        log.info("Saved {} admins to {}", admins.size(), storagePath);
    }

    private long generateNextId(List<Admin> admins) {
        if (admins.isEmpty()) {
            return 1;
        }
        return admins.stream()
                .mapToLong(Admin::getId)
                .max()
                .orElse(0) + 1;
    }
}
