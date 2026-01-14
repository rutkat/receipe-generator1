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
const closeRecipeBtn = document.getElementById('closeRecipeBtn');

let selectedFile = null;
let extractedRecipes = [];
let currentBase64Image = null;

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
    } catch (error) {
        console.warn('Failed to clear cache:', error);
    }
}

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
            handleFile(file);
        } else {
            displayError('Invalid file format. Please upload a JPG, PNG, GIF, or WebP image file.');
        }
    }
});

// Handle file selection
function handleFile(file) {
    selectedFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
        currentBase64Image = e.target.result;
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
    };
    reader.readAsDataURL(file);
}

// Cancel button
cancelBtn.addEventListener('click', () => {
    resetForm();
});

// Test button
testBtn.addEventListener('click', async () => {
    testBtn.disabled = true;
    testBtn.innerHTML = '<span class="loading"></span>Testing...';
    responseContainer.classList.remove('active');
    responseContainer.classList.remove('error-message');

    const testPayload = {
        model: "qwen/qwen3-vl-8b",
        messages: [
            {
                role: "system",
                content: "You're a chef and know how to create any recipe from food ingredients."
            },
            {
                role: "user",
                content: "I want a recipe"
            }
        ],
        temperature: 0.7,
        max_tokens: -1,
        stream: false
    };

    try {
        const response = await fetch('/api/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(testPayload)
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        displayResponse(data);
    } catch (error) {
        displayError(error.message);
    } finally {
        testBtn.disabled = false;
        testBtn.innerHTML = 'Test API Connection';
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

            const payload = {
                model: "qwen/qwen3-vl-8b",
                messages: [
                    {
                        role: "system",
                        content: "You're a chef and know how to create any recipe using food ingredients. Answer in short concise phrases without emojis."
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
                                text: "What ingredients are shown in the image? Create a separate list of possible recipes using the corresponding ingredients."
                            }
                        ]
                    }
                ],
                temperature: 0.7,
                max_tokens: -1,
                stream: false
            };

            try {
                const response = await fetch('/api/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(payload)
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const data = await response.json();
                displayResponse(data);
            } catch (error) {
                displayError(error.message);
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = 'Generate Recipe';
            }
        };
        reader.readAsDataURL(selectedFile);

    } catch (error) {
        displayError(error.message);
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Generate Recipe';
    }
});

function displayResponse(data) {
    responseContainer.classList.add('active');
    responseContainer.classList.remove('error-message');

    // Extract the content from the response
    const content = data.choices?.[0]?.message?.content || JSON.stringify(data, null, 2);
    responseContent.textContent = content;

    // Extract recipes from the response
    extractRecipes(content);

    // Save to cache
    if (currentBase64Image && extractedRecipes.length > 0) {
        saveToCache(currentBase64Image, data, extractedRecipes);
    }
}

function displayCachedData(cachedData) {
    responseContainer.classList.add('active');
    responseContainer.classList.remove('error-message');

    // Display the cached response content
    const content = cachedData.responseData.choices?.[0]?.message?.content || JSON.stringify(cachedData.responseData, null, 2);
    responseContent.innerHTML = `<em style="color: #4CAF50;">✓ Loaded from cache (${new Date(cachedData.timestamp).toLocaleString()})</em><br><br>${content}`;

    // Restore extracted recipes
    extractedRecipes = cachedData.recipes;

    // Populate dropdown if recipes found
    if (extractedRecipes.length > 0) {
        populateRecipeDropdown();
    }
}

function extractRecipes(content) {
    // Look specifically for items after "Possible recipes:"
    const lines = content.split('\n');
    extractedRecipes = [];

    // Find the line containing "Possible recipes:"
    let recipesSectionIndex = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes('possible recipes:')) {
            recipesSectionIndex = i;
            break;
        }
    }

    // If "Possible recipes:" not found, don't extract anything
    if (recipesSectionIndex === -1) {
        return;
    }

    // Extract items after "Possible recipes:" line
    // Look for numbered lists, bullet points, or lines that look like recipe names
    for (let i = recipesSectionIndex + 1; i < lines.length; i++) {
        const line = lines[i].trim();

        // Stop if we hit an empty line or a section header
        if (!line ||
            line.toLowerCase().includes('ingredients') ||
            line.toLowerCase().includes('instructions') ||
            line.toLowerCase().includes('directions') ||
            line.toLowerCase().includes('steps') ||
            line.match(/^[A-Z][a-z]+:/)) {  // Lines like "Ingredients:", "Instructions:"
            break;
        }

        // Try to match numbered list (1., 2., 3., etc.) or bullet points
        const match = line.match(/^(\d+[\.\)]+|[-•])\s*(.+)$/);

        if (match && match[2]) {
            let recipeName = match[2].trim()
                .replace(/^[:\-\s]+/, '')  // Remove leading colons, dashes, spaces
                .replace(/\s+[:\-\s]*$/, '');  // Remove trailing colons, dashes, spaces

            // Only add if it doesn't contain "ingredients" and has reasonable length
            if (recipeName.length > 2 &&
                recipeName.length < 100 &&
                !recipeName.toLowerCase().includes('ingredients')) {
                extractedRecipes.push(recipeName);
            }
        }
    }

    // Populate dropdown if recipes found
    if (extractedRecipes.length > 0) {
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

    const recipePayload = {
        model: "qwen/qwen3-vl-8b",
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
                        text: `Provide a complete, detailed recipe for ${selectedRecipe}. Include all ingredients with quantities and step-by-step cooking instructions. Format it clearly with sections for ingredients and instructions.`
                    }
                ]
            }
        ],
        temperature: 0.7,
        max_tokens: -1,
        stream: false
    };

    try {
        const response = await fetch('/api/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(recipePayload)
        });

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

// Close recipe button
closeRecipeBtn.addEventListener('click', () => {
    completeRecipeContainer.style.display = 'none';
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
