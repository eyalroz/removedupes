/*
 * This file is provided by the addon-developer-support repository at
 * https://github.com/thundernest/addon-developer-support
 *
 * Version: 1.9
 * - automatically remove all entries added by injectElements
 *
 * Version: 1.8
 * - add injectElements
 *
 * Version: 1.7
 * - add injectCSS
 * - add optional enforced namespace
 *
 * Version: 1.6
 * - added mutation observer to be able to inject into browser elements
 * - use larger icons as fallback
 *
 * Author: John Bieling (john@thunderbird.net)
 * 
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. 
 */


// Import some things we need. 
var { ExtensionCommon } = ChromeUtils.import("resource://gre/modules/ExtensionCommon.jsm");
var { ExtensionSupport } = ChromeUtils.import("resource:///modules/ExtensionSupport.jsm");
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

var WindowListener = class extends ExtensionCommon.ExtensionAPI {
  getAPI(context) {
    // track if this is the background/main context
    this.isBackgroundContext = (context.viewType == "background");
    
    this.namespace = "AddOnNS" + context.extension.instanceId;
    this.menu_addonsManager_id ="addonsManager";
    this.menu_addonsManager_prefs_id = "addonsManager_prefs_revived";
    this.menu_addonPrefs_id = "addonPrefs_revived";

    this.registeredWindows = {};
    this.pathToStartupScript = null;
    this.pathToShutdownScript = null;
    this.pathToOptionsPage = null;
    this.chromeHandle = null;
    this.chromeData = null;
    this.openWindows = [];
  
    const aomStartup = Cc["@mozilla.org/addons/addon-manager-startup;1"].getService(Ci.amIAddonManagerStartup);
    
    let self = this;
    
    this.counts = 0;
    
    return {
      WindowListener: {
        
        registerOptionsPage(optionsUrl) {
          self.pathToOptionsPage = optionsUrl.startsWith("chrome://") 
            ? optionsUrl 
            : context.extension.rootURI.resolve(optionsUrl);
        },
        
        registerDefaultPrefs(defaultUrl) {
          let url = context.extension.rootURI.resolve(defaultUrl);
          let prefsObj = {};
          prefsObj.Services = ChromeUtils.import("resource://gre/modules/Services.jsm").Services;
          prefsObj.pref = function(aName, aDefault) {
            let defaults = Services.prefs.getDefaultBranch("");
            switch (typeof aDefault) {
              case "string":
                  return defaults.setCharPref(aName, aDefault);

              case "number":
                  return defaults.setIntPref(aName, aDefault);
              
              case "boolean":
                  return defaults.setBoolPref(aName, aDefault);
                
              default:
                throw new Error("Preference <" + aName + "> has an unsupported type <" + typeof aDefault + ">. Allowed are string, number and boolean.");            
            }
          }          
          Services.scriptloader.loadSubScript(url, prefsObj, "UTF-8");
        },
        
        registerChromeUrl(chromeData) {
          if (!self.isBackgroundContext) 
            throw new Error("The WindowListener API may only be called from the background page.");

          const manifestURI = Services.io.newURI(
            "manifest.json",
            null,
            context.extension.rootURI
          );
          self.chromeHandle = aomStartup.registerChrome(manifestURI, chromeData);
          self.chromeData = chromeData;
        },

        registerWindow(windowHref, jsFile) {
          if (!self.isBackgroundContext) 
            throw new Error("The WindowListener API may only be called from the background page.");

          if (!self.registeredWindows.hasOwnProperty(windowHref)) {
            // path to JS file can either be chrome:// URL or a relative URL
            let path = jsFile.startsWith("chrome://") 
              ? jsFile 
              : context.extension.rootURI.resolve(jsFile)
            self.registeredWindows[windowHref] = path;
          } else {
            console.error("Window <" +windowHref + "> has already been registered");
          }
        },

        registerStartupScript(aPath) {
          if (!self.isBackgroundContext) 
            throw new Error("The WindowListener API may only be called from the background page.");

          self.pathToStartupScript = aPath.startsWith("chrome://") 
            ? aPath
            : context.extension.rootURI.resolve(aPath);
        },
        
        registerShutdownScript(aPath) {
          if (!self.isBackgroundContext) 
            throw new Error("The WindowListener API may only be called from the background page.");

          self.pathToShutdownScript = aPath.startsWith("chrome://") 
            ? aPath
            : context.extension.rootURI.resolve(aPath);
        },
        
        startListening(_forcedNamespace = null) {
          if (_forcedNamespace) {
            self.namespace = _forcedNamespace;
          }
          
          // async sleep function using Promise
          async function sleep(delay) {
            let timer =  Components.classes["@mozilla.org/timer;1"].createInstance(Components.interfaces.nsITimer);            
            return new Promise(function(resolve, reject) {
              let event = {
                notify: function(timer) {
                  resolve();
                }
              }            
              timer.initWithCallback(event, delay, Components.interfaces.nsITimer.TYPE_ONE_SHOT);
            });
          };

          if (!self.isBackgroundContext) 
            throw new Error("The WindowListener API may only be called from the background page.");

          let urls = Object.keys(self.registeredWindows);
          if (urls.length > 0) {
            // Before registering the window listener, check which windows are already open
            self.openWindows = [];
            for (let window of Services.wm.getEnumerator(null)) {
              self.openWindows.push(window);
            }
            
            // Register window listener for all pre-registered windows
            ExtensionSupport.registerWindowListener("injectListener_" + self.namespace, {
              // React on all windows and manually reduce to the registered
              // windows, so we can do special actions when the main 
              // messenger window is opened.
              //chromeURLs: Object.keys(self.registeredWindows),
              onLoadWindow(window) {                
                if (window.hasOwnProperty(self.namespace)) {
                  throw new Error("Namespace <" + self.namespace + "> already exists, aborting to load add-on <" + self.extension.manifest.name + ">");
                  return;
                }
                window[self.namespace] = {};
                
                // Special action #1: If this is the main messenger window
                if (window.location.href == "chrome://messenger/content/messenger.xul" ||
                  window.location.href == "chrome://messenger/content/messenger.xhtml") {

                  if (self.pathToOptionsPage) {                   
                    try {
                      // add the add-on options menu if needed
                      if (!window.document.getElementById(self.menu_addonsManager_prefs_id)) {
                        let addonprefs = window.MozXULElement.parseXULToFragment(`
                          <menu id="${self.menu_addonsManager_prefs_id}" label="&addonPrefs.label;">
                            <menupopup id="${self.menu_addonPrefs_id}">
                            </menupopup>
                          </menu>                    
                        `, ["chrome://messenger/locale/messenger.dtd"]);
                      
                      let element_addonsManager = window.document.getElementById(self.menu_addonsManager_id);
                      element_addonsManager.parentNode.insertBefore(addonprefs, element_addonsManager.nextSibling);	
                      }
                      
                      // add the options entry
                      let element_addonPrefs = window.document.getElementById(self.menu_addonPrefs_id);
                      let id = self.menu_addonPrefs_id + "_" + self.namespace;
                      
                      // Get the best size of the icon (16px or bigger)
                      let iconSizes = Object.keys(self.extension.manifest.icons);
                      iconSizes.sort((a,b)=>a-b);
                      let bestSize = iconSizes.filter(e => parseInt(e) >= 16).shift();
                      let icon = bestSize ? self.extension.manifest.icons[bestSize] : "";
                      
                      let name = self.extension.manifest.name;
                      let entry = window.MozXULElement.parseXULToFragment(
                        `<menuitem class="menuitem-iconic" id="${id}" image="${icon}" label="${name}" />`);
                      element_addonPrefs.appendChild(entry);
                      window.document.getElementById(id).addEventListener("command", function() {window.openDialog(self.pathToOptionsPage, "AddonOptions")});
                    } catch (e) {
                      Components.utils.reportError(e)
                    }
                  }
                  
                  // load the registered startup script, if one has been registered
                  // (only for the initial main window)
                  if (self.counts == 0 && self.pathToStartupScript) {
                    self.counts++;
                    let startupJS = {};
                    startupJS.extension = self.extension;
                    startupJS.messenger = Array.from(self.extension.views).find(
                      view => view.viewType === "background").xulBrowser.contentWindow
                      .wrappedJSObject.browser;
                    try {
                      if (self.pathToStartupScript) Services.scriptloader.loadSubScript(self.pathToStartupScript, startupJS, "UTF-8");
                    } catch (e) {
                      Components.utils.reportError(e)
                    }                    
                  }
                }

                // Special action #2: If this page contains browser elements
                let browserElements = window.document.getElementsByTagName("browser");
                if (browserElements.length > 0) {
                  //register a MutationObserver
                  window[self.namespace]._mObserver = new window.MutationObserver(function(mutations) {
                      mutations.forEach(async function(mutation) {
                          if (mutation.attributeName == "src" && self.registeredWindows.hasOwnProperty(mutation.target.getAttribute("src"))) {
                            // When the MutationObserver callsback, the window is still showing "about:black" and it is going
                            // to unload and then load the new page. Any eventListener attached to the window will be removed
                            // so we cannot listen for the load event. We have to poll manually to learn when loading has finished.
                            // On my system it takes 70ms.
                            let loaded = false;
                            for (let i=0; i < 100 && !loaded; i++) {
                              await sleep(100);  
                              let targetWindow = mutation.target.contentWindow.wrappedJSObject;
                              if (targetWindow && targetWindow.location.href == mutation.target.getAttribute("src") && targetWindow.document.readyState == "complete") {
                                loaded = true;
                                break;
                              }
                            }
                            if (loaded) {
                              let targetWindow = mutation.target.contentWindow.wrappedJSObject;
                              if (targetWindow.hasOwnProperty(self.namespace)) {
                                throw new Error("Namespace <" + self.namespace + "> already exists, aborting to load add-on <" + self.extension.manifest.name + ">");
                                return;
                              }
                              targetWindow[self.namespace] = {};
                              // load of window has finished, inject (isAddonActivation = false)
                              self._loadIntoWindow(targetWindow, false);
                            }
                          }
                      });    
                  });

                  for (let element of browserElements) {
                      if (self.registeredWindows.hasOwnProperty(element.getAttribute("src"))) {
                        let targetWindow = element.contentWindow.wrappedJSObject;
                        if (targetWindow.hasOwnProperty(self.namespace)) {
                          throw new Error("Namespace <" + self.namespace + "> already exists, aborting to load add-on <" + self.extension.manifest.name + ">");
                          return;
                        }
                        targetWindow[self.namespace] = {};
                        //inject directly because the window is already open (isAddonActivation = true)
                        self._loadIntoWindow(targetWindow, true);
                      } else {
                        // inject after browser has been loaded
                        window[self.namespace]._mObserver.observe(element, { attributes: true, childList: false, characterData: false });
                      }
                  }
                }
                
                // Load JS into window
                self._loadIntoWindow(window, self.openWindows.includes(window));
              },

              onUnloadWindow(window) {
                // Remove JS from window, window is being closed, addon is not shut down
                self._unloadFromWindow(window, false);
              }
            });
          } else {
            console.error("Failed to start listening, no windows registered");
          }
        },
        
      }
    };
  }

  _loadIntoWindow(window, isAddonActivation) {
      if (window.hasOwnProperty(this.namespace) && this.registeredWindows.hasOwnProperty(window.location.href)) {
        try {
          // Create add-on specific namespace
          window[this.namespace].namespace = this.namespace;
          window[this.namespace].window = window;
          window[this.namespace].document = window.document;
          
          // helper function to inject CSS
          window[this.namespace].injectCSS = function (cssFile) {
            let ns = window.document.documentElement.lookupNamespaceURI("html");
            let element = window.document.createElementNS(ns, "link");
            element.setAttribute("wlapi_autoinjected", this.namespace);
            element.setAttribute("rel", "stylesheet");
            element.setAttribute("href", cssFile);
            return window.document.documentElement.appendChild(element);
          }

          // helper function to inject DOM elements
          window[this.namespace].injectElements = function (xulString, dtdFiles = [], debug = false) {
            function checkElements(stringOfIDs) {
              let arrayOfIDs = stringOfIDs.split(",").map(e => e.trim());
              for (let id of arrayOfIDs) {
                let element = window.document.getElementById(id);
                if (element) {
                  return element;
                }
              }
              return null;
            }
            
            function injectChildren(elements, container, namespace, debug) {
              if (debug) console.log(elements);
              
              for (let i = 0; i < elements.length; i++) {                
                if (elements[i].hasAttribute("insertafter") && checkElements(elements[i].getAttribute("insertafter"))) {
                  let insertAfterElement = checkElements(elements[i].getAttribute("insertafter"));
                  
                  if (debug) console.log(elements[i].id + ": insertafter " + insertAfterElement.id);
                  if (elements[i].id && window.document.getElementById(elements[i].id)) {
                    console.error("The id <" + elements[i].id + "> of the injected element already exists in the document!"); 
                  }
                  
                  elements[i].setAttribute("wlapi_autoinjected", namespace);
                  insertAfterElement.parentNode.insertBefore(elements[i], insertAfterElement.nextSibling);
                  
                } else if (elements[i].hasAttribute("insertbefore") && checkElements(elements[i].getAttribute("insertbefore"))) {
                  let insertBeforeElement = checkElements(elements[i].getAttribute("insertbefore"));
                  
                  if (debug) console.log(elements[i].id + ": insertbefore " + insertBeforeElement.id);
                  if (elements[i].id && window.document.getElementById(elements[i].id)) {
                    console.error("The id <" + elements[i].id + "> of the injected element already exists in the document!"); 
                    }

                  elements[i].setAttribute("wlapi_autoinjected", namespace);
                  insertBeforeElement.parentNode.insertBefore(elements[i], insertBeforeElement);

                } else if (elements[i].id && window.document.getElementById(elements[i].id)) {
                  // existing container match, dive into recursivly
                  if (debug) console.log(elements[i].id + " is an existing container, injecting into " + elements[i].id);
                  injectChildren(Array.from(elements[i].children), window.document.getElementById(elements[i].id), namespace, debug);

                } else {
                  // append element to the current container
                  if (debug) console.log(elements[i].id + ": append to " + container.id);
                  elements[i].setAttribute("wlapi_autoinjected", namespace);
                  container.appendChild(elements[i]);
                }
              }
            }

            if (debug) console.log ("Injecting into root document:");
            injectChildren(Array.from(window.MozXULElement.parseXULToFragment(xulString, dtdFiles).children), window.document.documentElement, this.namespace, debug);
          }
          
          // Make extension object available in loaded JavaScript
          window[this.namespace].extension = this.extension;
          // Add messenger obj
          window[this.namespace].messenger = Array.from(this.extension.views).find(
            view => view.viewType === "background").xulBrowser.contentWindow
            .wrappedJSObject.browser;                  
          // Load script into add-on specific namespace
          Services.scriptloader.loadSubScript(this.registeredWindows[window.location.href], window[this.namespace], "UTF-8");
          // Call onLoad(window, wasAlreadyOpen)
          window[this.namespace].onLoad(isAddonActivation);
        } catch (e) {
          Components.utils.reportError(e)
        }
      }
  }
  
  _unloadFromWindow(window, isAddonDeactivation) {
      // unload any contained browser elements
      if (window.hasOwnProperty(this.namespace) && window[this.namespace].hasOwnProperty("_mObserver")) {
        window[this.namespace]._mObserver.disconnect();
        let browserElements = window.document.getElementsByTagName("browser");
        for (let element of browserElements) {
          this._unloadFromWindow(element.contentWindow.wrappedJSObject, isAddonDeactivation);         
        }        
      }

      if (window.hasOwnProperty(this.namespace) && this.registeredWindows.hasOwnProperty(window.location.href)) {
        //  Remove this window from the list of open windows
        this.openWindows = this.openWindows.filter(e => (e != window));    
        
        // Remove all auto injected objects
        let elements = Array.from(window.document.querySelectorAll('[wlapi_autoinjected="' + this.namespace + '"]'));
        for (let element of elements) {
          element.remove();
        }        

        try {
          // Call onUnload()
          window[this.namespace].onUnload(isAddonDeactivation);
        } catch (e) {
          Components.utils.reportError(e)
        }
      }
      
      // Remove namespace object, if it exists
      if (window.hasOwnProperty(this.namespace)) {
        delete window[this.namespace];
      }
  }


  onShutdown(isAppShutdown) {
    // temporary installed addons always return isAppShutdown = false
    if (isAppShutdown)
      return;
  
    // Unload from all still open windows
    let urls = Object.keys(this.registeredWindows);
    if (urls.length > 0) {          
      for (let window of Services.wm.getEnumerator(null)) {

        //remove our entry in the add-on options menu
        if (
          this.pathToOptionsPage && 
          (window.location.href == "chrome://messenger/content/messenger.xul" ||
          window.location.href == "chrome://messenger/content/messenger.xhtml")) {            
          let id = this.menu_addonPrefs_id + "_" + this.namespace;
          window.document.getElementById(id).remove();
          
          //do we have to remove the entire add-on options menu?
          let element_addonPrefs = window.document.getElementById(this.menu_addonPrefs_id);
          if (element_addonPrefs.children.length == 0) {
            window.document.getElementById(this.menu_addonsManager_prefs_id).remove();
          }
        }
        
        // if we reach this point, it is NOT app shutdown, but only addon shutdown
        // -> isAddonShutdown = true
        this._unloadFromWindow(window, true);
      }
      // Stop listening for new windows.
      ExtensionSupport.unregisterWindowListener("injectListener_" + this.namespace);
    }
    
    // Load registered shutdown script
    let shutdownJS = {};
    shutdownJS.extension = this.extension;
    try {
      if (this.pathToShutdownScript) Services.scriptloader.loadSubScript(this.pathToShutdownScript, shutdownJS, "UTF-8");
    } catch (e) {
      Components.utils.reportError(e)
    }

    // Extract all registered chrome content urls
    let chromeUrls = [];
    if (this.chromeData) {
        for (let chromeEntry of this.chromeData) {
        if (chromeEntry[0].toLowerCase().trim() == "content") {
          chromeUrls.push("chrome://" + chromeEntry[1] + "/");
        }
      }
    }

    // Unload JSMs of this add-on    
    const rootURI = this.extension.rootURI.spec;
    for (let module of Cu.loadedModules) {
      if (module.startsWith(rootURI) || (module.startsWith("chrome://") && chromeUrls.find(s => module.startsWith(s)))) {
        console.log("Unloading: " + module);
        Cu.unload(module);
      }
    }    

    // Flush all caches
    Services.obs.notifyObservers(null, "startupcache-invalidate");
    this.registeredWindows = {};
    
    if (this.chromeHandle) {
      this.chromeHandle.destruct();
      this.chromeHandle = null;
    }    
  }
};
