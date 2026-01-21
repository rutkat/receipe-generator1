const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const previewContainer = document.getElementById('previewContainer');
const previewImage = document.getElementById('previewImage');
const cancelBtn = document.getElementById('cancelBtn');
const submitBtn = document.getElementById('submitBtn');
const testBtn = document.getElementById('testBtn');
const clearCacheBtn = document.getElementById('clearCacheBtn');
const responseContainer = document.getElementById('responseContainer');
const responseContent = document.getElementById('responseContent');
const recipeDropdownContainer = document.getElementById('recipeDropdownContainer');
const recipeSelect = document.getElementById('recipeSelect');
const getRecipeBtn = document.getElementById('getRecipeBtn');
const completeRecipeContainer = document.getElementById('completeRecipeContainer');
const completeRecipeContent = document.getElementById('completeRecipeContent');
const copyRecipeBtn = document.getElementById('copyRecipeBtn');
const dietRestrictionSelect = document.getElementById('dietRestriction');
const cuisineSelect = document.getElementById('cuisine');
const servingSizeInput = document.getElementById('servingSize');
const placeholderContainer = document.getElementById('placeholderContainer');

let selectedFile = null;
let extractedRecipes = [];
let currentBase64Image = null;
const LLM_MODEL = "qwen/qwen3-vl-8b";
const SYSTEM_ROLE = "You're a highly rated michelin-star chef that knows how to cook to create recipe using food ingredients. Respond in JSON object format only without using emojis."

// Cache management
const CACHE_KEY_PREFIX = 'recipe_cache_';
const CACHE_VERSION = 'v1';
const MAX_CACHE_SIZE = 20; // Maximum number of cached recipes

// Generate a cache key from base64 image
function generateCacheKey(base64Image) {
    // Create a simple hash from the base64 string
    const hash = base64Image.split('').reduce((acc, char) => {
        return ((acc << 5) - acc) + char.charCodeAt(0);
    }, 0);
    return `${CACHE_KEY_PREFIX}${CACHE_VERSION}_${Math.abs(hash)}`;
}

// Save recipe data to cache
function saveToCache(base64Image, responseData, recipes) {
    try {
        // Clean old cache entries if we have too many
        cleanOldCacheEntries();

        const cacheKey = generateCacheKey(base64Image);
        const cacheData = {
            timestamp: Date.now(),
            responseData: responseData,
            recipes: recipes,
            base64Image: base64Image.substring(0, 1000) // Store first 1000 chars for verification
        };

        localStorage.setItem(cacheKey, JSON.stringify(cacheData));
        console.log('Recipe cached successfully');

        // Show the Clear Recipes button
        clearCacheBtn.style.display = 'block';
    } catch (error) {
        console.warn('Failed to cache recipe:', error);
    }
}

// Load recipe data from cache
function loadFromCache(base64Image) {
    try {
        const cacheKey = generateCacheKey(base64Image);
        const cachedData = localStorage.getItem(cacheKey);

        if (cachedData) {
            const data = JSON.parse(cachedData);
            // Verify the image matches
            if (data.base64Image === base64Image.substring(0, 1000)) {
                console.log('Recipe loaded from cache');
                return data;
            }
        }
        return null;
    } catch (error) {
        console.warn('Failed to load from cache:', error);
        return null;
    }
}

// Clean old cache entries to prevent storage overflow
function cleanOldCacheEntries() {
    try {
        const allKeys = Object.keys(localStorage);
        const recipeCacheKeys = allKeys.filter(key => key.startsWith(CACHE_KEY_PREFIX));

        if (recipeCacheKeys.length >= MAX_CACHE_SIZE) {
            // Sort by timestamp and remove oldest entries
            const entries = recipeCacheKeys.map(key => {
                const data = JSON.parse(localStorage.getItem(key));
                return { key, timestamp: data.timestamp };
            });

            entries.sort((a, b) => a.timestamp - b.timestamp);

            // Remove oldest entries
            const toRemove = entries.slice(0, entries.length - MAX_CACHE_SIZE + 1);
            toRemove.forEach(entry => {
                localStorage.removeItem(entry.key);
            });
            console.log(`Cleaned ${toRemove.length} old cache entries`);
        }
    } catch (error) {
        console.warn('Failed to clean cache:', error);
    }
}

// Clear all recipe cache
function clearAllCache() {
    try {
        const allKeys = Object.keys(localStorage);
        const recipeCacheKeys = allKeys.filter(key => key.startsWith(CACHE_KEY_PREFIX));
        recipeCacheKeys.forEach(key => localStorage.removeItem(key));
        console.log(`Cleared ${recipeCacheKeys.length} cache entries`);

        // Hide the Clear Recipes button after clearing
        clearCacheBtn.style.display = 'none';
    } catch (error) {
        console.warn('Failed to clear cache:', error);
    }
}

// Function to switch from placeholder to upload area
function switchToUploadArea() {
    if (placeholderContainer.style.display !== 'none') {
        placeholderContainer.style.display = 'none';
        uploadArea.style.display = 'block';
    }
}

// Event listeners for preference changes
dietRestrictionSelect.addEventListener('change', switchToUploadArea);
cuisineSelect.addEventListener('change', switchToUploadArea);
servingSizeInput.addEventListener('input', switchToUploadArea);

// Click to upload
uploadArea.addEventListener('click', () => {
    fileInput.click();
});

// File input change
fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        if (validTypes.includes(file.type)) {
            // Check file size (5MB limit)
            const maxSize = 5 * 1024 * 1024; // 5MB in bytes
            if (file.size > maxSize) {
                displayError('File size exceeds 5MB limit. Please upload a smaller image.');
                return;
            }
            handleFile(file);
        } else {
            displayError('Invalid file format. Please upload a JPG, PNG, GIF, or WebP image file.');
        }
    }
});

// Drag and drop
uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragover');
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) {
        const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        if (validTypes.includes(file.type)) {
            // Check file size (5MB limit)
            const maxSize = 5 * 1024 * 1024; // 5MB in bytes
            if (file.size > maxSize) {
                displayError('File size exceeds 5MB limit. Please upload a smaller image.');
                return;
            }
            handleFile(file);
        } else {
            displayError('Invalid file format. Please upload a JPG, PNG, GIF, or WebP image file.');
        }
    }
});

// Handle file selection
function handleFile(file) {
    selectedFile = file;

    // Check if file needs compression (larger than 2MB)
    const compressionThreshold = 2 * 1024 * 1024; // 2MB in bytes

    if (file.size > compressionThreshold) {
        // Compress the image
        compressImage(file, 0.65, (compressedBase64) => {
            currentBase64Image = compressedBase64;
            displayImagePreview();
        });
    } else {
        // No compression needed, read file normally
        const reader = new FileReader();
        reader.onload = (e) => {
            currentBase64Image = e.target.result;
            displayImagePreview();
        };
        reader.readAsDataURL(file);
    }
}

// Display image preview
function displayImagePreview() {
    previewImage.src = currentBase64Image;
    uploadArea.style.display = 'none';
    previewContainer.classList.add('active');
    responseContainer.classList.remove('active');
    recipeDropdownContainer.style.display = 'none';
    completeRecipeContainer.style.display = 'none';

    // Check if this image has been processed before (load from cache)
    const cachedData = loadFromCache(currentBase64Image);
    if (cachedData) {
        // Display cached data
        displayCachedData(cachedData);
    }
}

// Compress image using canvas
function compressImage(file, quality, callback) {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);

            // Compress to JPG format with specified quality
            const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
            callback(compressedDataUrl);
        };
    };
}

// Cancel button
cancelBtn.addEventListener('click', () => {
    resetForm();
});

// Test button
testBtn.addEventListener('click', async () => {
    testBtn.disabled = true;
    testBtn.innerHTML = '<span class="loading"></span>Calling Chef...';
    responseContainer.classList.remove('active');
    responseContainer.classList.remove('error-message');

    const testPayload = {
        model: LLM_MODEL,
        messages: [
            {
                role: "system",
                content: SYSTEM_ROLE
            },
            {
                role: "user",
                content: "Hello Chef Bot!"
            }
        ],
        temperature: 0.7,
        max_tokens: -1,
        stream: false
    };

    let success = false;

    try {
        // Create timeout controller
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 180000); // 180 second timeout

        const response = await fetch('/api/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(testPayload),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`Sorry,an HTTP error occured! ${response.status}`);
        }

        const data = await response.json();

        // For greeting response, display only the value from the "greeting" key
        const content = data.choices?.[0]?.message?.content || JSON.stringify(data, null, 2);
        let greetingText = content;

        try {
            // Try to parse the content as JSON and extract the greeting value
            const parsedData = JSON.parse(content);
            if (parsedData.greeting) {
                greetingText = parsedData.greeting;
            }
        } catch (e) {
            // If not JSON or no greeting key, use the content as-is
        }

        responseContainer.classList.add('active');
        responseContent.textContent = greetingText;
        success = true;

        // Hide the button after successful API call
        testBtn.style.display = 'none';
    } catch (error) {
        displayError(error.message);
    } finally {
        // Only reset button state if there was an error
        if (!success) {
            testBtn.disabled = false;
            testBtn.innerHTML = 'Greet Chef Bot';
        }
    }
});

// Submit button
submitBtn.addEventListener('click', async () => {
    if (!selectedFile) return;

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="loading"></span>Processing...';
    responseContainer.classList.remove('active');
    responseContainer.classList.remove('error-message');

    try {
        // Create form data to send the file
        const formData = new FormData();
        formData.append('image', selectedFile);

        // For this implementation, we'll send the file as base64 in the JSON payload
        const reader = new FileReader();
        reader.onload = async () => {
            const base64Image = reader.result;

            // Get user preferences
            const dietRestriction = dietRestrictionSelect.value;
            const cuisine = cuisineSelect.value;
            const servingSize = servingSizeInput.value;

            // Build preference text for prompt
            let preferenceText = "";
            if (dietRestriction !== 'none') {
                preferenceText += ` The recipe must be ${dietRestriction}.`;
            }
            if (cuisine !== 'any') {
                preferenceText += ` Focus on ${cuisine} cuisine.`;
            }
            preferenceText += ` The recipe should serve ${servingSize} people.`;

            const payload = {
                model: LLM_MODEL,
                messages: [
                    {
                        role: "system",
                        content: SYSTEM_ROLE
                    },
                    {
                        role: "user",
                        content: [
                            {
                                type: "image_url",
                                image_url: {
                                    url: base64Image
                                }
                            },
                            {
                                type: "text",
                                text: `Analyze the image and identify all visible ingredients including count of ingredient found in the image. Do not add ingredients if they are not detected in the image. Then suggest recipes that can be made using those ingredients${preferenceText}

If explicit or harmful imagery is detected, set the harmful key to true.
IMPORTANT: You must respond with a valid JSON object ONLY, with no additional text. The JSON must have this exact structure:
{
  "harmful": false,
  "ingredient_count": integer,                              
  "ingredients": ["ingredient 1", "ingredient 2", ...],
  "recipes": ["recipe name 1", "recipe name 2", ...]
}`
                            }
                        ]
                    }
                ],
                temperature: 0.7,
                max_tokens: -1,
                stream: false
            };

            try {
                // Create timeout controller
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 180000); // 180 second timeout

                const response = await fetch('/api/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(payload),
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const data = await response.json();
                displayResponse(data);
            } catch (error) {
                displayError(error.message);
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = 'Get Recipes';
            }
        };
        reader.readAsDataURL(selectedFile);

    } catch (error) {
        displayError(error.message);
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Get Recipes';
    }
});

function displayResponse(data) {
    responseContainer.classList.add('active');
    responseContainer.classList.remove('error-message');

    // Extract the content from the response
    const content = data.choices?.[0]?.message?.content || JSON.stringify(data, null, 2);

    try {
        // Parse the JSON response
        const parsedData = parseJSONResponse(content);

        // Check for harmful content or insufficient ingredients
        if (parsedData.harmful === true || (parsedData.ingredient_count !== undefined && parsedData.ingredient_count < 3)) {
            // Display error message and don't show recipe dropdown
            responseContent.innerHTML = `<div style="color: #d32f2f; font-size: 16px; padding: 15px;">Oops, insufficient ingredients detected. Try a different image.</div>`;
            recipeDropdownContainer.style.display = 'none';
            completeRecipeContainer.style.display = 'none';
            return;
        }

        // Format the response to show ingredients and recipes
        const formattedContent = formatJSONResponse(parsedData);
        responseContent.innerHTML = formattedContent;

        // Extract recipes from the parsed data
        extractRecipesFromJSON(parsedData);

        // Save to cache
        if (currentBase64Image && extractedRecipes.length > 0) {
            saveToCache(currentBase64Image, data, extractedRecipes);
        }
    } catch (error) {
        // If JSON parsing fails, display the raw content with error
        responseContent.innerHTML = `<div style="color: #d32f2f;">Error parsing response: ${error.message}</div><div style="margin-top: 10px;">Raw response:</div><pre>${escapeHtml(content)}</pre>`;
        // Hide recipe dropdown on error
        recipeDropdownContainer.style.display = 'none';
        completeRecipeContainer.style.display = 'none';
    }
}

// Parse JSON response from LLM
function parseJSONResponse(content) {
    // Try to extract JSON from the response if there's additional text
    let jsonStr = content.trim();

    // Look for JSON object boundaries
    const firstBrace = jsonStr.indexOf('{');
    const lastBrace = jsonStr.lastIndexOf('}');

    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
    }

    // Parse the JSON
    const parsed = JSON.parse(jsonStr);

    // Validate the structure
    if (!parsed.ingredients || !Array.isArray(parsed.ingredients)) {
        throw new Error('Response must contain an "ingredients" array');
    }
    if (!parsed.recipes || !Array.isArray(parsed.recipes)) {
        throw new Error('Response must contain a "recipes" array');
    }

    return parsed;
}

// Format the JSON response for display
function formatJSONResponse(data) {
    let html = '';

    // Format ingredients section
    if (data.ingredients && data.ingredients.length > 0) {
        html += '<div style="margin-top: 15px; margin-bottom: 10px; font-weight: 600; color: #333; font-size: 16px;">Identified Ingredients:</div>';
        data.ingredients.forEach((ingredient, index) => {
            html += `<div style="margin-left: 20px; margin-bottom: 5px; color: #555;">${index + 1}. ${escapeHtml(ingredient)}</div>`;
        });
    }

    // Format recipes section
    if (data.recipes && data.recipes.length > 0) {
        html += '<div style="margin-top: 20px; margin-bottom: 10px; font-weight: 600; color: #333; font-size: 16px;">Available Recipes:</div>';
        data.recipes.forEach((recipe, index) => {
            html += `<div style="margin-left: 20px; margin-bottom: 5px; color: #555;">${index + 1}. ${escapeHtml(recipe)}</div>`;
        });
    }

    return html;
}

// Extract recipes from parsed JSON data
function extractRecipesFromJSON(data) {
    extractedRecipes = data.recipes || [];
    populateRecipeDropdown();
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function displayCachedData(cachedData) {
    responseContainer.classList.add('active');
    responseContainer.classList.remove('error-message');

    // Display the cached response content with formatting
    const content = cachedData.responseData.choices?.[0]?.message?.content || JSON.stringify(cachedData.responseData, null, 2);

    try {
        // Try to parse as JSON and format
        const parsedData = parseJSONResponse(content);

        // Check for harmful content or insufficient ingredients
        if (parsedData.harmful === true || (parsedData.ingredient_count !== undefined && parsedData.ingredient_count < 5)) {
            // Display error message and don't show recipe dropdown
            responseContent.innerHTML = `<div style="color: #d32f2f; font-size: 16px; padding: 15px;">Oops, insufficient ingredients detected. Try a different image.</div>`;
            recipeDropdownContainer.style.display = 'none';
            completeRecipeContainer.style.display = 'none';
            return;
        }

        const formattedContent = formatJSONResponse(parsedData);
        responseContent.innerHTML = `<em style="color: #4CAF50;">✓ Loaded from cache (${new Date(cachedData.timestamp).toLocaleString()})</em><br><br>${formattedContent}`;

        // Restore extracted recipes
        extractedRecipes = cachedData.recipes || [];
        populateRecipeDropdown();
    } catch (error) {
        // If JSON parsing fails, display raw content
        responseContent.innerHTML = `<em style="color: #4CAF50;">✓ Loaded from cache (${new Date(cachedData.timestamp).toLocaleString()})</em><br><br><pre>${escapeHtml(content)}</pre>`;
        extractedRecipes = cachedData.recipes || [];
        populateRecipeDropdown();
    }
}

function populateRecipeDropdown() {
    // Clear existing options
    recipeSelect.innerHTML = '<option value="">Choose a recipe...</option>';

    // Add extracted recipes
    extractedRecipes.forEach((recipe, index) => {
        const option = document.createElement('option');
        option.value = recipe;
        option.textContent = recipe;
        recipeSelect.appendChild(option);
    });

    // Show dropdown container
    recipeDropdownContainer.style.display = 'block';

    // Enable/disable get recipe button based on selection
    recipeSelect.onchange = () => {
        getRecipeBtn.disabled = !recipeSelect.value;
    };
}

function displayError(message) {
    responseContainer.classList.add('active');
    responseContainer.classList.add('error-message');
    // Replace "Failed to fetch" with more user-friendly message
    const errorMessage = message === 'Failed to fetch'
        ? 'Unable to detect LLM API'
        : message;
    responseContent.textContent = `Error: ${errorMessage}`;
}

// Get complete recipe button
getRecipeBtn.addEventListener('click', async () => {
    const selectedRecipe = recipeSelect.value;
    if (!selectedRecipe) return;

    getRecipeBtn.disabled = true;
    getRecipeBtn.innerHTML = '<span class="loading"></span>Getting Recipe...';
    completeRecipeContainer.style.display = 'none';

    // Get user preferences
    const cuisine = cuisineSelect.value;
    const servingSize = servingSizeInput.value;
    let cuisineText = '';
    if (cuisine !== 'any') {
        cuisineText = ` This should be a ${cuisine} recipe.`;
    }
    const servingText = ` The recipe should serve ${servingSize} people.`;

    const recipePayload = {
        model: LLM_MODEL,
        messages: [
            {
                role: "system",
                content: "You're a chef and know how to create any recipe using food ingredients. Provide detailed, step-by-step recipes with ingredients and instructions."
            },
            {
                role: "user",
                content: [
                    {
                        type: "image_url",
                        image_url: {
                            url: currentBase64Image
                        }
                    },
                    {
                        type: "text",
                        text: `Provide a complete, detailed recipe for ${selectedRecipe}.${cuisineText}${servingText} Include all ingredients with quantities and step-by-step cooking instructions. Format it clearly in plain text with sections for ingredients and instructions.`
                    }
                ]
            }
        ],
        temperature: 0.7,
        max_tokens: -1,
        stream: false
    };

    try {
        // Create timeout controller
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 180000); // 180 second timeout

        const response = await fetch('/api/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(recipePayload),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        displayCompleteRecipe(data);
    } catch (error) {
        displayError(error.message);
    } finally {
        getRecipeBtn.disabled = false;
        getRecipeBtn.innerHTML = 'Get Complete Recipe';
    }
});

function displayCompleteRecipe(data) {
    const content = data.choices?.[0]?.message?.content || JSON.stringify(data, null, 2);
    completeRecipeContent.textContent = content;
    completeRecipeContainer.style.display = 'block';

    // Scroll to the complete recipe
    completeRecipeContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Copy recipe button
copyRecipeBtn.addEventListener('click', () => {
    const recipeText = completeRecipeContent.textContent;

    // Use the Clipboard API to copy the text
    navigator.clipboard.writeText(recipeText).then(() => {
        // Show visual feedback
        const originalHTML = copyRecipeBtn.innerHTML;
        copyRecipeBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4CAF50" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
        `;
        copyRecipeBtn.style.color = '#4CAF50';

        // Reset after 2 seconds
        setTimeout(() => {
            copyRecipeBtn.innerHTML = originalHTML;
            copyRecipeBtn.style.color = '#666';
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy recipe:', err);
        alert('Failed to copy recipe. Please try again.');
    });
});

// Clear cache button
clearCacheBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to clear all cached recipes? This will remove all saved recipe data.')) {
        clearAllCache();
        alert('Recipe cache cleared successfully!');
    }
});

function resetForm() {
    selectedFile = null;
    currentBase64Image = null;
    extractedRecipes = [];
    fileInput.value = '';
    previewImage.src = '';
    uploadArea.style.display = 'block';
    previewContainer.classList.remove('active');
    responseContainer.classList.remove('active');
    responseContainer.classList.remove('error-message');
    recipeDropdownContainer.style.display = 'none';
    completeRecipeContainer.style.display = 'none';
}

// Initialize: Check if there are cached recipes on page load
function initializeClearButton() {
    try {
        const allKeys = Object.keys(localStorage);
        const recipeCacheKeys = allKeys.filter(key => key.startsWith(CACHE_KEY_PREFIX));

        // Show the Clear Recipes button if there are cached recipes
        if (recipeCacheKeys.length > 0) {
            clearCacheBtn.style.display = 'block';
        }
    } catch (error) {
        console.warn('Failed to check cache on initialization:', error);
    }
}

// Run initialization when page loads
initializeClearButton();
