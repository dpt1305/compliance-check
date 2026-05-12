package vibe.code.compliance.controller;

import jakarta.validation.constraints.NotBlank;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import vibe.code.compliance.dto.SubmissionResponseDTO;
import vibe.code.compliance.service.ExcelMappingService;
import vibe.code.compliance.service.SubmissionService;

import java.io.IOException;
import java.util.Map;
import java.util.Set;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
@Validated
public class SubmissionController {

    private final SubmissionService submissionService;
    private final ExcelMappingService excelMappingService;

    @PostMapping(value = "/submission", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<SubmissionResponseDTO> submit(
            @RequestParam @NotBlank(message = "Account is required") String account,
            @RequestParam @NotBlank(message = "Submission type is required") String submissionType,
            @RequestParam MultipartFile image
    ) throws IOException {
        SubmissionResponseDTO response = submissionService.processSubmission(account, submissionType, image);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/mapping/types")
    public ResponseEntity<Map<String, Object>> getSupportedTypes() {
        Set<String> types = excelMappingService.getSupportedTypes();
        return ResponseEntity.ok(Map.of("types", types));
    }

    @GetMapping("/mapping/types/{type}")
    public ResponseEntity<ExcelMappingService.TypeMapping> getTypeDetail(@PathVariable String type) {
        return excelMappingService.getMapping(type)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }
}
