// ===== INITIALIZATION =====
// Initialize Memberstack
const memberstack = window.$memberstackDom;

// Global variable to store member JSON data
let memberJson;

// ===== HELPER FUNCTIONS =====

// Function to get a nested property from an object using a dot-separated path
const getNestedProperty = (obj, path) => {
  return path.split('.').reduce((acc, part) => {
    if (acc && typeof acc === 'object') {
      return acc[part] || acc[part.replace(/-/g, '')];
    }
    return undefined;
  }, obj);
};

// Function to set a nested property in an object using a dot-separated path
const setNestedProperty = (obj, path, value) => {
  const parts = path.split('.');
  const last = parts.pop();
  const parent = parts.reduce((acc, part) => (acc[part] = acc[part] || {}), obj);
  parent[last] = value;
};

// Function to decode HTML entities (e.g., &amp; to &)
const decodeHTMLEntities = (() => {
  const textArea = document.createElement('textarea');
  return (text) => {
    textArea.innerHTML = text;
    return textArea.value;
  };
})();

// Debounce utility function
const debounce = (func, delay) => {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  };
};

// ===== MAIN FUNCTIONS =====

// Function to update the UI by calling all handler functions
const updateUI = () => {
  console.log('Current memberJson.data:', JSON.stringify(memberJson.data, null, 2));
  
  // Store states of elements with 'ms-json-preserve-state' attribute
  const preservedStates = {};
  document.querySelectorAll('[ms-json-preserve-state]').forEach(el => {
    const stateId = el.getAttribute('ms-json-preserve-state');
    if (stateId) {
      preservedStates[stateId] = {
        display: el.style.display,
        // Add other properties you want to preserve
      };
    }
  });

  [handleJsonRender, handleJsonCount, handleJsonIfAndIfNot, handleJsonRenderTextAndAttr, handleJsonBind, handleJsonDeleteAndClear]
    .forEach(handler => handler());

  // Restore states of preserved elements
  Object.keys(preservedStates).forEach(stateId => {
    const el = document.querySelector(`[ms-json-preserve-state="${stateId}"]`);
    if (el) {
      el.style.display = preservedStates[stateId].display;
      // Restore other preserved properties
    }
  });

  console.log('UI updated');
};

// Function to initialize JSON attributes and set up event handlers
const handleJsonAttributes = async () => {
  try {
    memberJson = await memberstack.getMemberJSON();
    memberJson.data = memberJson.data || {};
    updateUI();
    [handleJsonBind, handleJsonBindDefault, handleJsonCreateAndUpdate, handleJsonDeleteAndClear]
      .forEach(handler => handler());
  } catch (error) {
    console.error('Error initializing JSON attributes:', error);
  }
};

// ===== EVENT HANDLERS =====

// Handler for elements with ms-json-bind attribute
const handleJsonBind = () => {
  document.querySelectorAll('[ms-json-bind]').forEach(el => {
    const path = el.getAttribute('ms-json-bind');
    
    const updateValue = async () => {
      setNestedProperty(memberJson.data, path, el.type === 'checkbox' ? el.checked : el.value);
      await memberstack.updateMemberJSON({ json: memberJson.data });
      updateUI();
    };

    const debouncedUpdate = debounce(updateValue, 2000); // 2000ms = 2 seconds
    
    if (el.type === 'checkbox') {
      el.checked = getNestedProperty(memberJson.data, path) === true;
      el.addEventListener('change', updateValue); // For checkboxes, we update immediately
    } else {
      el.value = getNestedProperty(memberJson.data, path) || '';
      el.addEventListener('input', (e) => {
        // Update the local data immediately
        setNestedProperty(memberJson.data, path, e.target.value);
        // Debounce the API call and UI update
        debouncedUpdate();
      });
    }
  });
};

// Handler for elements with ms-json-bind-default attribute
const handleJsonBindDefault = () => {
  document.querySelectorAll('[ms-json-bind-default]').forEach(el => {
    const path = el.getAttribute('ms-json-bind');
    const defaultValue = el.getAttribute('ms-json-bind-default');
    if (!getNestedProperty(memberJson.data, path)) {
      setNestedProperty(memberJson.data, path, defaultValue);
      el.value = defaultValue;
      memberstack.updateMemberJSON({ json: memberJson.data });
    }
  });
};

// Handler for elements with ms-json-create or ms-json-update attributes
const handleJsonCreateAndUpdate = () => {
  document.querySelectorAll('[ms-json-create], [ms-json-update]').forEach(el => {
    el.addEventListener('submit', async (e) => {
      e.preventDefault();
      const createPath = el.getAttribute('ms-json-create');
      const updatePath = el.getAttribute('ms-json-update');
      const jsonType = el.getAttribute('ms-json-type');

      const formData = new FormData(el);
      const newItem = Object.fromEntries(formData.entries());

      if (createPath) {
        if (!jsonType) {
          console.error('ms-json-type must be specified for ms-json-create');
          return;
        }

        if (jsonType === 'object') {
          const existingData = getNestedProperty(memberJson.data, createPath);
          if (existingData && typeof existingData === 'object') {
            // Update existing object
            Object.assign(existingData, newItem);
          } else {
            // Create new object
            setNestedProperty(memberJson.data, createPath, newItem);
          }
        } else if (jsonType === 'array') {
          let array = getNestedProperty(memberJson.data, createPath);
          if (!Array.isArray(array)) {
            array = [];
            setNestedProperty(memberJson.data, createPath, array);
          }
          array.push(newItem);
        }
      } else if (updatePath) {
        if (updatePath.includes('{index}')) {
          // Array update
          const parts = updatePath.split('.');
          const indexPart = parts.findIndex(part => part === '{index}');
          if (indexPart !== -1) {
            const arrayPath = parts.slice(0, indexPart).join('.');
            const array = getNestedProperty(memberJson.data, arrayPath);
            if (Array.isArray(array)) {
              const index = parseInt(formData.get('index'), 10);
              if (!isNaN(index) && index >= 0 && index < array.length) {
                Object.assign(array[index], newItem);
              }
            }
          }
        } else {
          // Object update
          const existingData = getNestedProperty(memberJson.data, updatePath);
          if (existingData && typeof existingData === 'object') {
            Object.assign(existingData, newItem);
          } else {
            setNestedProperty(memberJson.data, updatePath, newItem);
          }
        }
      }

      await memberstack.updateMemberJSON({ json: memberJson.data });
      updateUI();
      el.reset(); // Reset the form after submission
    });
  });
};

// Handler for elements with ms-json-render attribute
const handleJsonRender = () => {
  document.querySelectorAll('[ms-json-render]').forEach(el => {
    const path = el.getAttribute('ms-json-render');
    const filterCondition = el.getAttribute('ms-json-filter');
    const templateElement = document.querySelector(`template[ms-json-template="${path}"]`);
    
    if (!templateElement) {
      console.error(`Template for "${path}" not found`);
      return;
    }

    const template = templateElement.innerHTML;
    let data = getNestedProperty(memberJson.data, path);

    if (!Array.isArray(data)) {
      console.warn(`Data at path "${path}" is not an array`);
      data = [];
    }

    // Apply filter if ms-json-filter is present
    if (filterCondition) {
      data = filterData(data, filterCondition);
    }

    el.innerHTML = data.map((item, index) => {
      let itemHtml = template.replace(/\{index\}/g, index);
      ['ms-json-render-text', 'ms-json-bind', 'ms-json-update'].forEach(attr => {
        const regex = new RegExp(`${attr}=['"]([^'"]+)['"]`, 'g');
        itemHtml = itemHtml.replace(regex, (match, key) => {
          const value = attr === 'ms-json-render-text' ? encodeURIComponent(getNestedProperty(item, key.replace(`${path}.{index}.`, '')) || '') : '';
          return `${attr}="${key.replace('{index}', index)}"${value ? ` data-rendered="${value}"` : ''}`;
        });
      });
      return itemHtml;
    }).join('');

    el.querySelectorAll('[ms-json-render-text]').forEach(textEl => {
      const renderedValue = decodeURIComponent(textEl.getAttribute('data-rendered') || '');
      textEl.textContent = renderedValue;
      textEl.removeAttribute('data-rendered');
    });

    handleJsonBind();
    handleJsonDeleteAndClear();
  });
};

// Handler for elements with ms-json-render-text or ms-json-render-attr attributes
const handleJsonRenderTextAndAttr = () => {
  document.querySelectorAll('[ms-json-render-text], [ms-json-render-attr]').forEach(el => {
    const textPath = el.getAttribute('ms-json-render-text');
    const attrPath = el.getAttribute('ms-json-render-attr');
    if (textPath) {
      const value = getNestedProperty(memberJson.data, textPath);
      el.textContent = value !== undefined ? value : '';
    }
    if (attrPath) {
      const [attr, path] = attrPath.split(':');
      const value = getNestedProperty(memberJson.data, path);
      el.setAttribute(attr, value !== undefined ? value : '');
    }
  });
};

// Handler for elements with ms-json-delete or ms-json-clear attribute
const handleJsonDeleteAndClear = () => {
  document.querySelectorAll('[ms-json-delete], [ms-json-clear]').forEach(el => {
    el.removeEventListener('click', handleDeleteOrClearClick);
    el.addEventListener('click', handleDeleteOrClearClick);
  });
};

// Click handler for elements with ms-json-delete or ms-json-clear attribute
const handleDeleteOrClearClick = async function(e) {
  e.preventDefault();
  const deletePath = this.getAttribute('ms-json-delete');
  const clearPath = this.getAttribute('ms-json-clear');

  if (deletePath) {
    const parts = deletePath.split('.');
    const last = parts.pop();
    const parent = getNestedProperty(memberJson.data, parts.join('.'));
    if (Array.isArray(parent)) {
      const index = parseInt(last, 10);
      if (!isNaN(index) && index >= 0 && index < parent.length) {
        parent.splice(index, 1);
      }
    } else if (typeof parent === 'object' && parent !== null) {
      delete parent[last];
    }
  } else if (clearPath) {
    const target = getNestedProperty(memberJson.data, clearPath);
    if (Array.isArray(target)) {
      // Clear array
      setNestedProperty(memberJson.data, clearPath, []);
    } else if (typeof target === 'object' && target !== null) {
      // Clear object values
      Object.keys(target).forEach(key => {
        if (Array.isArray(target[key])) {
          target[key] = [];
        } else if (typeof target[key] === 'object' && target[key] !== null) {
          target[key] = {};
        } else {
          target[key] = null; // or '' if you prefer empty string for primitive values
        }
      });
    } else {
      console.warn(`Path ${clearPath} is not an array or object, or doesn't exist.`);
    }
  }

  await memberstack.updateMemberJSON({ json: memberJson.data });
  updateUI();
};

// Handler for elements with ms-json-if or ms-json-if-not attributes
const handleJsonIfAndIfNot = () => {
  document.querySelectorAll('[ms-json-if], [ms-json-if-not]').forEach(el => {
    const condition = el.getAttribute('ms-json-if') || el.getAttribute('ms-json-if-not');
    try {
      const result = new Function('json', `
        try {
          with (json) {
            return ${condition};
          }
        } catch (e) {
          console.warn('Error in condition evaluation:', e);
          return false;
        }
      `)(memberJson.data);
      
      el.style.display = (el.hasAttribute('ms-json-if') && !result) || (el.hasAttribute('ms-json-if-not') && result) ? 'none' : '';
    } catch (error) {
      console.warn('Error creating evaluation function:', condition, error);
      el.style.display = 'none';
    }
  });
};

// Handler for elements with ms-json-count attribute
const handleJsonCount = () => {
  document.querySelectorAll('[ms-json-count]').forEach(el => {
    const path = el.getAttribute('ms-json-count');
    const filterCondition = el.getAttribute('ms-json-filter');
    let array = getNestedProperty(memberJson.data, path);
    
    if (!Array.isArray(array)) {
      console.warn(`Data at path "${path}" is not an array`);
      array = [];
    }
    
    if (filterCondition) {
      array = filterData(array, filterCondition);
    }
    
    el.textContent = array.length;
  });
};

// Update the filterData function
const filterData = (data, condition) => {
  try {
    const [prop, operator, value] = condition.split(' ');
    return data.filter(item => {
      if (!(prop in item)) {
        return operator === '!==' || operator === '!=';
      }
      switch (operator) {
        case '===':
          return item[prop] === (value === 'true');
        case '!==':
          return item[prop] !== (value === 'true');
        default:
          return false;
      }
    });
  } catch (error) {
    console.error('Error in filter condition:', error);
    return data;
  }
};

// ===== INITIALIZATION =====
// Set up event listener to initialize JSON attributes when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', handleJsonAttributes);