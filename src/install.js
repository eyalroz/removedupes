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
    registerChrome(localeFlag, folder, "locale/de/" + name + "/");
    registerChrome(localeFlag, folder, "locale/it-IT/" + name + "/");
    registerChrome(localeFlag, folder, "locale/ja/" + name + "/");
    //registerChrome(localeFlag, folder, "locale/ja-JP-mac/" + name + "/");
    registerChrome(localeFlag, folder, "locale/zh-TW/" + name + "/");
    registerChrome(localeFlag, folder, "locale/zh-CN/" + name + "/");
    registerChrome(localeFlag, folder, "locale/sk-SK/" + name + "/");
    registerChrome(localeFlag, folder, "locale/pt-PT/" + name + "/");
    registerChrome(localeFlag, folder, "locale/pt-BR/" + name + "/");
    registerChrome(localeFlag, folder, "locale/nl/" + name + "/");
    registerChrome(localeFlag, folder, "locale/fr/" + name + "/");
    registerChrome(localeFlag, folder, "locale/pl/" + name + "/");
    registerChrome(localeFlag, folder, "locale/he-IL/" + name + "/");
    registerChrome(localeFlag, folder, "locale/ru-RU/" + name + "/");
    registerChrome(localeFlag, folder, "locale/da/" + name + "/");
    registerChrome(localeFlag, folder, "locale/cs-CZ/" + name + "/");
    registerChrome(localeFlag, folder, "locale/es-AR/" + name + "/");
    registerChrome(localeFlag, folder, "locale/is-IS/" + name + "/");
    registerChrome(localeFlag, folder, "locale/es-ES/" + name + "/");
    registerChrome(localeFlag, folder, "locale/sv-SE/" + name + "/");

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
