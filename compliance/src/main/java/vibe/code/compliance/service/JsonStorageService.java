package vibe.code.compliance.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import vibe.code.compliance.model.Submission;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.*;
import java.util.concurrent.atomic.AtomicLong;

@Service
@Slf4j
@RequiredArgsConstructor
public class JsonStorageService {

    private final ObjectMapper objectMapper;

    @Value("${storage.json.path:./data/submissions.json}")
    private String storagePath;

    private final AtomicLong idCounter = new AtomicLong(0);

    public Submission save(Submission submission) throws IOException {
        List<Submission> submissions = loadAll();

        if (submission.getId() == null || submission.getId() == 0) {
            submission.setId(generateNextId(submissions));
        }

        // Remove old version if exists
        submissions.removeIf(s -> s.getId().equals(submission.getId()));

        // Add new version
        submissions.add(submission);

        saveAll(submissions);
        log.info("Saved submission id={} to JSON file", submission.getId());
        return submission;
    }

    public Optional<Submission> findById(Long id) throws IOException {
        List<Submission> submissions = loadAll();
        return submissions.stream()
                .filter(s -> s.getId().equals(id))
                .findFirst();
    }

    public List<Submission> findAll() throws IOException {
        return loadAll();
    }

    public List<Submission> findByAccount(String account) throws IOException {
        List<Submission> submissions = loadAll();
        return submissions.stream()
                .filter(s -> s.getAccount().equalsIgnoreCase(account))
                .toList();
    }

    public void delete(Long id) throws IOException {
        List<Submission> submissions = loadAll();
        submissions.removeIf(s -> s.getId().equals(id));
        saveAll(submissions);
        log.info("Deleted submission id={}", id);
    }

    public boolean existsById(Long id) throws IOException {
        List<Submission> submissions = loadAll();
        return submissions.stream().anyMatch(s -> s.getId().equals(id));
    }

    public List<Submission> findByStatus(Submission.SubmissionStatus status) throws IOException {
        List<Submission> submissions = loadAll();
        return submissions.stream()
                .filter(s -> s.getStatus() == status)
                .toList();
    }

    private List<Submission> loadAll() throws IOException {
        File file = new File(storagePath);

        if (!file.exists()) {
            log.debug("Submissions file does not exist at: {}", storagePath);
            return new ArrayList<>();
        }

        try {
            log.debug("Loading submissions from: {}", file.getAbsolutePath());
            Submission[] submissionsArray = objectMapper.readValue(file, Submission[].class);
            log.info("Successfully loaded {} submissions from JSON file", submissionsArray.length);
            return new ArrayList<>(Arrays.asList(submissionsArray));
        } catch (IOException e) {
            log.error("Error reading JSON storage file at {}: {}", storagePath, e.getMessage(), e);
            return new ArrayList<>();
        }
    }

    private void saveAll(List<Submission> submissions) throws IOException {
        File file = new File(storagePath);
        File parent = file.getParentFile();

        if (parent != null && !parent.exists()) {
            log.info("Creating parent directories for: {}", parent.getAbsolutePath());
            if (!parent.mkdirs()) {
                log.warn("Failed to create parent directories");
            }
        }

        try {
            log.debug("Saving {} submissions to: {}", submissions.size(), file.getAbsolutePath());
            objectMapper.writerWithDefaultPrettyPrinter()
                    .writeValue(file, submissions);
            log.info("Successfully saved {} submissions to {}", submissions.size(), storagePath);
        } catch (IOException e) {
            log.error("Failed to save submissions to {}: {}", storagePath, e.getMessage(), e);
            throw e;
        }
    }

    private long generateNextId(List<Submission> submissions) {
        if (submissions.isEmpty()) {
            return 1;
        }
        return submissions.stream()
                .mapToLong(Submission::getId)
                .max()
                .orElse(0) + 1;
    }
}
