package vibe.code.compliance.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import vibe.code.compliance.dto.AiValidationResult;
import vibe.code.compliance.dto.SubmissionResponseDTO;
import vibe.code.compliance.model.Submission;
import vibe.code.compliance.repository.SubmissionRepository;
import vibe.code.compliance.service.ai.AiValidationService;
import vibe.code.compliance.util.FileStorageUtil;
import vibe.code.compliance.util.ImageRenameUtil;
import vibe.code.compliance.util.MagicBytesValidator;

import java.io.IOException;

@Service
@Slf4j
@RequiredArgsConstructor
public class SubmissionService {

    // private final SubmissionRepository submissionRepository; // COMMENTED OUT - Using JSON storage instead
    private final JsonStorageService jsonStorageService;
    private final FileStorageUtil fileStorageUtil;
    private final ExcelMappingService excelMappingService;
    private final AiValidationService aiValidationService;
    private final ExcelUpdateService excelUpdateService;
    private final ObjectMapper objectMapper;

    public SubmissionResponseDTO processSubmission(String account, String submissionType, MultipartFile image) throws IOException {
        // Dual validation: MIME type + magic bytes
        MagicBytesValidator.validate(image);

        // Verify submission type is supported via Excel mapping
        if (!excelMappingService.isTypeSupported(submissionType)) {
            throw new IllegalArgumentException("Unsupported submission type: '" + submissionType +
                    "'. Supported types: " + excelMappingService.getSupportedTypes());
        }

        // Verify image extension is allowed for this submission type
        var mapping = excelMappingService.getMapping(submissionType).orElseThrow();
        String imageExt = MagicBytesValidator.getExtension(image).replace(".", "");
        if (!mapping.allowedTypeList().contains(imageExt)) {
            throw new IllegalArgumentException("Image format '" + imageExt +
                    "' is not allowed for submission type '" + submissionType +
                    "'. Allowed formats: " + mapping.allowedImageTypes());
        }

        // Call AI validation before persisting
        byte[] imageBytes = image.getBytes();
        AiValidationResult aiResult = aiValidationService.validate(imageBytes, image.getContentType(), submissionType);
        log.info("AI validation for account={} type={}: valid={} confidence={}",
                account, submissionType, aiResult.valid(), aiResult.confidence());

        // Rename and store image on disk
        String savedName = ImageRenameUtil.generateSavedName(account, submissionType, image);
        String storedPath = fileStorageUtil.store(image, savedName);
        String publicUrl = fileStorageUtil.getPublicUrl(savedName);

        // Persist submission record with AI result
        Submission submission = new Submission();
        submission.setAccount(account);
        submission.setSubmissionType(submissionType);
        submission.setImagePath(storedPath);
        submission.setImageUrl(publicUrl);
        submission.setImageOriginalName(image.getOriginalFilename());
        submission.setImageSavedName(savedName);
        submission.setValidationResult(objectMapper.writeValueAsString(aiResult));
        submission.setValidationChecklist(objectMapper.writeValueAsString(aiResult.failedChecks()));
        submission.setConfidenceScore(aiResult.confidence());

        // Extract Windows-specific checklist items
        if ("windows".equalsIgnoreCase(submissionType) && aiResult.failedChecks() != null) {
            submission.setHasClock(!aiResult.failedChecks().stream().anyMatch(c -> c.toLowerCase().contains("clock")));
            submission.setHasWindowsUpdate(!aiResult.failedChecks().stream().anyMatch(c -> c.toLowerCase().contains("update")));
            submission.setHasDeviceName(!aiResult.failedChecks().stream().anyMatch(c -> c.toLowerCase().contains("device name")));
            submission.setHasDeviceSerial(!aiResult.failedChecks().stream().anyMatch(c -> c.toLowerCase().contains("serial")));
            submission.setHasDashboard(!aiResult.failedChecks().stream().anyMatch(c -> c.toLowerCase().contains("dashboard")));
        }
        // Extract Thin client-specific checklist items (Trellix only)
        else if ("thin".equalsIgnoreCase(submissionType) && aiResult.failedChecks() != null) {
            submission.setHasTrellix(!aiResult.failedChecks().stream().anyMatch(c -> c.toLowerCase().contains("trellix")));
        }
        // Extract Mac-specific checklist items
        else if ("mac".equalsIgnoreCase(submissionType) && aiResult.failedChecks() != null) {
            submission.setHasSeedDashboard(!aiResult.failedChecks().stream().anyMatch(c -> c.toLowerCase().contains("seed")));
            submission.setHasTrellix(!aiResult.failedChecks().stream().anyMatch(c -> c.toLowerCase().contains("trellix")));
            submission.setHasTimestamp(!aiResult.failedChecks().stream().anyMatch(c -> c.toLowerCase().contains("timestamp")));
            submission.setHasMacInfo(!aiResult.failedChecks().stream().anyMatch(c -> c.toLowerCase().contains("mac info") || c.toLowerCase().contains("system info")));
        }

        submission.setStatus(
                aiResult.valid() && aiResult.matchesType()
                        ? Submission.SubmissionStatus.APPROVED
                        : Submission.SubmissionStatus.REJECTED
        );

        // submission = submissionRepository.save(submission); // COMMENTED OUT - Using JSON storage
        submission = jsonStorageService.save(submission);
        log.info("Saved submission id={} account={} status={}", submission.getId(), account, submission.getStatus());

        // Update tracking Excel file if submission was approved
        if (submission.getStatus() == Submission.SubmissionStatus.APPROVED) {
            excelUpdateService.updateExcelAfterSubmission(
                    submissionType,
                    submission.getValidationResult()
            );
        }

        return SubmissionResponseDTO.from(submission);
    }
}
