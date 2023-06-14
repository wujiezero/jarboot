package com.mz.jarboot.service.impl;

import com.mz.jarboot.common.JarbootException;
import com.mz.jarboot.common.pojo.PagedList;
import com.mz.jarboot.common.utils.StringUtils;
import com.mz.jarboot.constant.AuthConst;
import com.mz.jarboot.dao.RoleDao;
import com.mz.jarboot.dao.UserDao;
import com.mz.jarboot.entity.User;
import com.mz.jarboot.service.UserService;
import com.mz.jarboot.utils.PasswordEncoderUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Example;
import org.springframework.data.domain.ExampleMatcher;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import javax.annotation.PostConstruct;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * @author majianzheng
 */
@Service
public class UserServiceImpl implements UserService {
    private static String PATTEN = "^[A-Za-z_0-9]{3,18}$";
    @Autowired
    private UserDao userDao;
    @Autowired
    private RoleDao roleDao;

    @Override
    @Transactional(rollbackFor = Throwable.class)
    public void createUser(String username, String fullName, String password, String roles, String userDir) {
        if (StringUtils.isEmpty(password)) {
            throw new JarbootException("Password is empty!");
        }
        if (AuthConst.JARBOOT_USER.equalsIgnoreCase(username)) {
            throw new JarbootException("Create user:" + username + " is internal user!");
        }
        checkFullName(fullName);
        checkUsernameAndRoles(username, roles);
        User user = new User();
        user.setUsername(username);
        user.setFullName(fullName);
        user.setRoles(roles);
        if (StringUtils.isEmpty(userDir)) {
            user.setUserDir(username);
        } else {
            if (StringUtils.containsWhitespace(userDir)) {
                throw new JarbootException("User dir:" + userDir + " contains whitespace!");
            }
            if (!Pattern.matches(PATTEN, userDir)) {
                throw new JarbootException("userDir must be A-Z a-z _ 0-9 length 3 to 18");
            }
            user.setUserDir(userDir);
        }
        user.setPassword(PasswordEncoderUtil.encode(password));
        userDao.save(user);
    }

    @Override
    @Transactional(rollbackFor = Throwable.class)
    public void deleteUser(Long id) {
        if (null == id) {
            throw new NullPointerException("id is empty!");
        }
        User user = userDao.findById(id).orElse(null);
        if (null == user) {
            throw new JarbootException("Can't find the user to delete.");
        }
        if (AuthConst.JARBOOT_USER.equals(user.getUsername())) {
            throw new JarbootException("The internal user, can't removed!");
        }
        userDao.delete(user);
    }

    @Override
    @Transactional(rollbackFor = Throwable.class)
    public void updateUserPassword(String currentLoginUser, String username, String oldPassword, String password) {
        if (StringUtils.isEmpty(currentLoginUser) || StringUtils.isEmpty(username) || StringUtils.isEmpty(password)) {
            throw new JarbootException("User or password is empty!");
        }
        User user = userDao.findFirstByUsername(username);
        if (null == user) {
            if (AuthConst.JARBOOT_USER.equalsIgnoreCase(username)) {
                user = new User();
                user.setUsername(AuthConst.JARBOOT_USER);
            } else {
                throw new JarbootException("User:" + username + " is not exist!");
            }
        }
        if (!AuthConst.JARBOOT_USER.equals(currentLoginUser)) {
            if (!PasswordEncoderUtil.matches(oldPassword, user.getPassword())) {
                throw new JarbootException("Password or username is not correct!");
            }
        }
        user.setPassword(PasswordEncoderUtil.encode(password));
        userDao.save(user);
    }

    @Override
    public void updateUser(String username, String fullName, String roles, String userDir) {
        if (StringUtils.isEmpty(username)) {
            throw new JarbootException("User is empty!");
        }
        checkFullName(fullName);
        User user = userDao.findFirstByUsername(username);
        if (null == user) {
            throw new JarbootException("User:" + username + " is not exist!");
        }
        if (StringUtils.isNotEmpty(roles)) {
            checkUsernameAndRoles(username, roles);
            user.setRoles(roles);
        }
        if (StringUtils.isNotEmpty(userDir)) {
            user.setUserDir(userDir);
        }
        user.setFullName(fullName);
        userDao.save(user);
    }

    private void checkFullName(String fullName) {
        if (StringUtils.isNotEmpty(fullName) && fullName.length() > 26) {
            throw new JarbootException("Full name length is big than 26!");
        }
    }

    @Override
    public User findUserByUsername(String username) {
        if (StringUtils.isEmpty(username)) {
            throw new JarbootException("User name can't be empty!");
        }
        User user = userDao.findFirstByUsername(username);
        if (null == user && AuthConst.JARBOOT_USER.equalsIgnoreCase(username)) {
            // 内置的用户名
            user = new User();
            // 使用默认的用户名和密码
            user.setUsername(AuthConst.JARBOOT_USER);
            user.setRoles(AuthConst.ADMIN_ROLE);
            user.setPassword(PasswordEncoderUtil.encode(AuthConst.JARBOOT_USER));
        }
        return user;
    }

    @Override
    public PagedList<User> getUsers(String username, String role, int pageNo, int pageSize) {
        PageRequest page = PageRequest.of(pageNo, pageSize);
        ExampleMatcher match = ExampleMatcher.matching().withStringMatcher(ExampleMatcher.StringMatcher.STARTING);
        if (StringUtils.isNotEmpty(username)) {
            match = match.withMatcher("username", ExampleMatcher.GenericPropertyMatchers.contains());
        }
        if (StringUtils.isNotEmpty(role)) {
            match = match.withMatcher("roles", ExampleMatcher.GenericPropertyMatchers.contains());
        }
        Page<User> all;
        if (StringUtils.isNotEmpty(username) || StringUtils.isNotEmpty(role)) {
            match = match.withIgnorePaths("password", "userDir");
            User query = new User();
            query.setUsername(username);
            query.setRoles(role);
            all = userDao.findAll(Example.of(query, match), page);
        } else {
            all = userDao.findAll(page);
        }
        List<User> result = all.getContent();
        return new PagedList<>(result, all.getTotalElements());
    }

    private void checkUsernameAndRoles(String username, String roles) {
        if (StringUtils.isEmpty(username)) {
            throw new JarbootException("Username is empty!");
        }
        if (StringUtils.containsWhitespace(username)) {
            throw new JarbootException("User:" + username + " contains whitespace!");
        }
        if (StringUtils.isEmpty(roles)) {
            throw new JarbootException("Role is empty!");
        }
        if (StringUtils.containsWhitespace(roles)) {
            throw new JarbootException("Role contains whitespace!");
        }
        if (!Pattern.matches(PATTEN, username)) {
            throw new JarbootException("Username must be A-Z a-z _ 0-9 length 3 to 18");
        }
        Set<String> roleSet = Arrays.stream(roles.split(",")).map(String::trim).collect(Collectors.toSet());
        if (roleSet.contains(AuthConst.SYS_ROLE) && !AuthConst.JARBOOT_USER.equals(username)) {
            throw new JarbootException("Can not assign SYSTEM role to normal user!");
        }
        for (String role : roleSet) {
            if (!roleDao.existsByRole(role)) {
                throw new JarbootException("Role is not exist!");
            }
        }
    }

    @Transactional(rollbackFor = Throwable.class)
    @PostConstruct
    public void init() {
        //检查是否存在jarboot用户，否则创建
        User user = userDao.findFirstByUsername(AuthConst.JARBOOT_USER);
        if (null != user) {
            return;
        }
        user = new User();
        user.setUsername(AuthConst.JARBOOT_USER);
        user.setRoles(AuthConst.SYS_ROLE + "," + AuthConst.ADMIN_ROLE);
        user.setUserDir("default");
        user.setPassword(PasswordEncoderUtil.encode(AuthConst.JARBOOT_USER));
        userDao.save(user);
    }
}
