/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * Contributor(s):
 *   Eyal Rozenberg <eyalroz@technion.ac.il>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

const displayName         = "Remove Duplicate Messages (Alternate)";
#expand const name             = "__SHORTNAME__";
const jarName             = name + ".jar";
const jarPath             = "chrome/";
const jarLocation         = jarPath + jarName;
const existsInApplication = File.exists(getFolder(getFolder("chrome"), jarName));
#expand const version             = "__VERSION__";
const optionalThe         = "the "; // if package name is an inspecific noun, use "the ", otherwise ""

var contentFlag = CONTENT | PROFILE_CHROME;
var localeFlag  = LOCALE  | PROFILE_CHROME;
var skinFlag    = SKIN    | PROFILE_CHROME;
var retval      = null;
var folder      = getFolder("Current User", "chrome");

const existsInProfile = File.exists(getFolder(folder, jarName));

// If the extension exists in the application folder or it doesn't exist in the profile folder and the user doesn't want it installed to the profile folder
if(existsInApplication || (!existsInProfile && !confirm("Do you want to install " + optionalThe + displayName + " extension into your profile folder?\n(Cancel will install into the application folder)")))
{
    if (existsInApplication)
    {
        alert("This extension is already installed in the application folder, overwriting it there.");
    }
    contentFlag = CONTENT | DELAYED_CHROME;
    localeFlag  = LOCALE  | DELAYED_CHROME;
    skinFlag    = SKIN    | DELAYED_CHROME;
    folder      = getFolder("chrome");
}

initInstall(displayName, name, version);
setPackageFolder(folder);
retval = addFile(name, version, jarLocation, folder, null);

if(retval == SUCCESS)
{
    // we've added the JAR file to the chrome folder
    
    folder = getFolder(folder, jarName);

    registerChrome(contentFlag, folder, "content/" + name + "/");
    registerChrome(localeFlag, folder, "locale/en-US/" + name + "/");
//    registerChrome(localeFlag, folder, "locale/he-IL/" + name + "/");
    registerChrome(skinFlag, folder, "skin/classic/" + name + "/");
//    registerChrome(skinFlag, folder, "skin/modern/" + name + "/");

    // Default Prefs File
    var componentsDir = getFolder("Program", "components");
    var prefDir = getFolder("Program", "defaults/pref");
    retval = addFile( "", "defaults/preferences/" + name + ".js", prefDir, "");
    if (retval == SUCCESS) {
        retval = performInstall();

        if ((retval != SUCCESS) && (retval != 999) && (retval != -239))
        {
            explainInstallRetval(retval,false);
            cancelInstall(retval);
        }
    }
    else
    {
        explainInstallRetval(retval,false);
        cancelInstall(retval);
    }
}
else
{
    explainInstallRetval(retval,false);
    cancelInstall(retval);
}

function explainInstallRetval(retval,considered_success)
{
    var str = "The installation of the " + displayName + " extension ";
    if (retval == SUCCESS)
    {
        str += "succeeded.";
    }
    else 
    {
        if (considered_success)
        {
            str += "succeeded. Please note:\n";
        }
        else 
        {
            str += "failed:\n";
        }

        if(retval == -215)
        {
            str += "One of the files being overwritten is read-only.";
        }
        else if(retval == -235)
        {
            str += "There is insufficient disk space.";
        }
        else if(retval == -239)
        {
            str += "There has been a chrome registration error.";
        }
        else if(retval == 999)
        {
            str += "You must restart the browser for the installation to take effect.";
        }
        else
        {
            str += "Installation returned with code: " + retval;
        }
    }
    alert(str);
}
